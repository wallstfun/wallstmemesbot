import { useState, useEffect, useCallback, useRef } from "react";

export const AGENT_WALLET = "Hw7yc27h6Lws6YsQmdLoj4M7psyFHRhosFwoGuSESmTh";

// Known stablecoin mints (USDC, USDT, USD1, etc.)
// Note: Used for stablecoin→SOL swap detection (when no incoming tokens found)
const STABLECOIN_MINTS = [
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC (6 decimals)
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenEsw", // USDT (6 decimals)
  "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB", // USD1 (World Liberty USD) - treat as stablecoin
];

// Stablecoin decimals mapping for safe amount calculations
const STABLECOIN_DECIMALS: Record<string, number> = {
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": 6, // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenEsw": 6, // USDT
  "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB": 6, // USD1
};

// Known token symbols for common mints
const KNOWN_TOKEN_SYMBOLS: Record<string, string> = {
  "4fSWEw2wbYEUCcMtitzmeGUfqinoafXxkhqZrA9Gpump": "PIGEON",
  "So11111111111111111111111111111111111111112": "SOL",
};

// Token metadata cache for symbol/name lookups
const tokenMetadataCache: Record<string, { symbol: string; name?: string }> = {};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fetch token metadata from cache only (Dex Screener + hardcoded list now primary)
async function getTokenMetadata(mint: string): Promise<{ symbol: string; name?: string }> {
  if (tokenMetadataCache[mint]) {
    return tokenMetadataCache[mint];
  }
  
  // Fallback to short symbol (no extra API calls — we use Dex Screener for unknown tokens)
  const fallback = { symbol: mint.slice(0, 6).toUpperCase() };
  tokenMetadataCache[mint] = fallback;
  return fallback;
}

// ── Real Swap Transactions (Enhanced TX API via Helius Key2) ──────────────────

export interface RealTrade {
  id: string;
  signature: string;
  shortSig: string;
  timestamp: Date;
  action: "BUY" | "SELL" | "SWAP";
  tokenSymbol: string;
  tokenMint: string;
  solAmount: number;
  tokenAmount: number;
  description: string;
  source: string;
  txUrl: string;
  /** Direction of SOL in this swap — used for P&L accounting */
  solFlow: "in" | "out" | "none";
  /** Mint of the token that was sent (only set when solFlow="in") — used to match closed positions */
  sentMint?: string;
  /** Currency symbol that was received (e.g., "SOL", "USD1", "USDC") — for correct display */
  receivedCurrency?: string;
}

const extractSymbolFromDescription = (desc: string, mint: string): string => {
  const m = desc.match(/for [\d,.]+ ([A-Z0-9]+) on/i);
  if (m) return m[1];
  const m2 = desc.match(/swapped [\d,.]+ ([A-Z0-9]+) for/i);
  if (m2) return m2[1];
  return mint.slice(0, 6).toUpperCase();
};

export function useRealTransactions() {
  const [trades, setTrades] = useState<RealTrade[]>([]);
  const [totalTrades, setTotalTrades] = useState<number>(0);
  const [winRate, setWinRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pausedUntilRef = useRef<number>(0);

  const fetchTrades = useCallback(async () => {
    // Respect backoff window
    if (Date.now() < pausedUntilRef.current) {
      const remaining = Math.ceil((pausedUntilRef.current - Date.now()) / 1000);
      setError(`Rate limited. Retrying in ${remaining}s…`);
      return;
    }

    try {
      const res = await fetch("/api/helius-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: AGENT_WALLET }),
      });

      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        const retryAfter = (data.retryAfter ?? 75) as number;
        pausedUntilRef.current = Date.now() + retryAfter * 1000;
        setError(`Rate limited. Retrying in ${retryAfter}s…`);
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const txs: any[] = await res.json();
      if (!Array.isArray(txs)) throw new Error("Unexpected response format");

      const parsed: RealTrade[] = txs
        .map((tx: any, idx: number) => {
          try {
            const swap = tx?.events?.swap;
            const sig = tx?.signature?.slice(0, 8) || `tx${idx}`;
            
            // Include Jupiter transactions and any tx with tokenTransfers that look like swaps
            const hasTransfers = (tx?.tokenTransfers?.length ?? 0) >= 2;
            // Mark as Jupiter only if it has a swap event OR explicitly from Jupiter (not all multi-transfers are Jupiter)
            const isJupiter = tx?.source === "JUPITER" || !!swap;
            
            console.log(`[parse] ${sig}: source=${tx?.source || "unknown"}, swap=${!!swap}, jupiter=${isJupiter}, transfers=${tx?.tokenTransfers?.length || 0}`);
            
            if (!swap && !isJupiter && !hasTransfers) {
              console.log(`[parse] ${sig}: DROPPED - no swap, not jupiter, <2 transfers`);
              return null;
            }

            let action: RealTrade["action"] = "SWAP";
            let solAmount = 0;
            let tokenAmount = 0;
            let tokenMint = "";
            let tokenSymbol = "";
            let solFlow: RealTrade["solFlow"] = "none";
            let receivedMint = "";
            let receivedSymbol = "";

            // For Jupiter fills or swap-like txs without top-level swap event, parse from token changes
            if (!swap && (isJupiter || hasTransfers)) {
              console.log(`[parse] ${sig}: Processing without swap event (jupiter=${isJupiter}, transfers=${hasTransfers})`);
              const changes = tx?.tokenTransfers ?? [];
              const nativeBalanceChange = tx?.nativeBalanceChange;
              
              // Check if we have enough data: 2+ token transfers OR 1 token transfer + native SOL change
              const hasEnoughData = (Array.isArray(changes) && changes.length >= 2) || 
                                   (Array.isArray(changes) && changes.length >= 1 && nativeBalanceChange && nativeBalanceChange !== 0);
              
              if (!hasEnoughData) {
                console.log(`[parse] ${sig}: DROPPED - insufficient transfers (changes=${changes.length}, native=${nativeBalanceChange ?? 0})`);
                return null;
              }
              
              const SOL_MINT = "So11111111111111111111111111111111111111112";
              const WALLET = AGENT_WALLET;
              
              // Find all incoming tokens (received by wallet)
              let incomingTransfers = changes.filter((t: any) => {
                const toAccount = t?.toUserAccount || t?.to;
                return toAccount && toAccount.toLowerCase() === WALLET.toLowerCase();
              });
              
              // Find all outgoing tokens (sent from wallet)
              let outgoingTransfers = changes.filter((t: any) => {
                const fromAccount = t?.fromUserAccount || t?.from;
                return fromAccount && fromAccount.toLowerCase() === WALLET.toLowerCase();
              });
              
              // Add native SOL balance changes as synthetic transfers
              if (nativeBalanceChange && nativeBalanceChange !== 0) {
                if (nativeBalanceChange > 0) {
                  // Received SOL
                  incomingTransfers.push({
                    mint: SOL_MINT,
                    tokenAddress: SOL_MINT,
                    tokenAmount: nativeBalanceChange.toString(),
                    decimals: 9,
                    tokenSymbol: "SOL",
                  });
                } else {
                  // Sent SOL
                  outgoingTransfers.push({
                    mint: SOL_MINT,
                    tokenAddress: SOL_MINT,
                    tokenAmount: Math.abs(nativeBalanceChange).toString(),
                    decimals: 9,
                    tokenSymbol: "SOL",
                  });
                }
              }
              
              console.log(`[parse] ${sig}: Incoming=${incomingTransfers.length}, Outgoing=${outgoingTransfers.length}`);
              
              // PRIMARY RULE: The token you RECEIVE is what you BOUGHT
              // Find the largest incoming token (main received asset)
              let receivedToken = incomingTransfers.length > 0
                ? incomingTransfers.reduce((max: any, t: any) => {
                    const maxAmount = Number(max?.tokenAmount ?? 0);
                    const currentAmount = Number(t?.tokenAmount ?? 0);
                    return currentAmount > maxAmount ? t : max;
                  })
                : null;
              
              // SPECIAL CASE: If no incoming tokens but outgoing stablecoin,
              // this is likely a stablecoin → SOL swap
              // Try to infer SOL amount from source (e.g., description or tx data)
              try {
                if (!receivedToken && outgoingTransfers.length > 0) {
                  const sentStable = outgoingTransfers.find((t: any) => {
                    const mint = t?.tokenAddress || t?.mint;
                    return mint && STABLECOIN_MINTS.includes(mint);
                  });
                  
                  if (sentStable) {
                    // IMPORTANT: Helius returns tokenAmount in UI-decimalized form
                    // (e.g., USDC with 6 decimals returns 95.46, not 95460000)
                    // This is verified by the tokenAmount value directly matching the UI representation
                    const mint = sentStable.tokenAddress || sentStable.mint;
                    const decimals = sentStable.decimals ?? STABLECOIN_DECIMALS[mint as string] ?? 6;
                    
                    // sentStable.tokenAmount is already UI-decimalized from Helius API
                    const sentAmount = Number(sentStable.tokenAmount ?? 0);
                    
                    // Safety check: if the amount looks raw (> 1e8), it's likely not UI-decimalized
                    // In that case, divide by 10^decimals
                    const uiAmount = sentAmount > 1e8 ? sentAmount / Math.pow(10, decimals) : sentAmount;
                    
                    // Estimate SOL amount based on current rates
                    // 1 stablecoin ≈ 0.012 SOL at $83/SOL price (approximate 1:1 value with slippage)
                    const estimatedSOL = uiAmount * 0.012;
                    
                    if (estimatedSOL > 0) {
                      // Create synthetic "received SOL" token
                      receivedToken = {
                        tokenAddress: SOL_MINT,
                        mint: SOL_MINT,
                        tokenAmount: (estimatedSOL * 1e9).toString(),
                        decimals: 9,
                        tokenSymbol: "SOL",
                      };
                      console.log(`[parse] ${sig}: INFERRED stablecoin → SOL: sent ${uiAmount.toFixed(2)} stablecoin, estimated ~${estimatedSOL.toFixed(4)} SOL received`);
                    }
                  }
                }
              } catch (err) {
                console.error(`[parse] ${sig}: Error inferring stablecoin swap:`, err);
              }
              
              if (receivedToken && (receivedToken.tokenAddress || receivedToken.mint)) {
                receivedMint = receivedToken.tokenAddress || receivedToken.mint;
                const receivedRawAmount = Number(receivedToken.tokenAmount ?? 0);
                const receivedDecimals = Number(receivedToken.decimals ?? 0);
                const receivedAmount = receivedRawAmount / Math.pow(10, receivedDecimals);
                // Symbol: Helius metadata → known map → mint (auto-fetches from Jupiter at holdings time)
                receivedSymbol = receivedToken.tokenSymbol || KNOWN_TOKEN_SYMBOLS[receivedMint] || receivedMint.slice(0, 6).toUpperCase();
                if (!receivedToken.tokenSymbol && receivedMint !== SOL_MINT) {
                  console.log(`[parse] ${sig}: New token detected: ${receivedMint.slice(0, 8)}... (will fetch symbol from holdings API)`);
                }
                
                // SIMPLE RULE: 
                // - If receiving STABLECOIN → SELL the token that was sent
                // - If receiving SOL by sending non-stablecoin → SELL that token
                // - Otherwise → BUY what was received
                
                if (STABLECOIN_MINTS.includes(receivedMint)) {
                  // Received stablecoin → SELL (exit position)
                  // Show the sent token as the asset
                  action = "SELL";
                  solFlow = "none";
                  
                  const sentNonStable = outgoingTransfers.filter((t: any) => {
                    const tMint = t?.tokenAddress || t?.mint;
                    return tMint !== SOL_MINT && !STABLECOIN_MINTS.includes(tMint);
                  });
                  
                  if (sentNonStable.length > 0) {
                    // Use the largest non-stablecoin outgoing token
                    const sentToken = sentNonStable.reduce((max: any, t: any) => {
                      return (Number(t?.tokenAmount ?? 0) > Number(max?.tokenAmount ?? 0)) ? t : max;
                    });
                    tokenMint = sentToken.tokenAddress || sentToken.mint;
                    const rawAmount = Number(sentToken.tokenAmount ?? 0);
                    const decimals = Number(sentToken.decimals ?? 0);
                    tokenAmount = rawAmount / Math.pow(10, decimals);
                    tokenSymbol = sentToken.tokenSymbol || KNOWN_TOKEN_SYMBOLS[tokenMint] || tokenMint.slice(0, 6).toUpperCase();
                    if (!sentToken.tokenSymbol && !KNOWN_TOKEN_SYMBOLS[tokenMint]) {
                      console.log(`[parse] ${sig}: New token detected (sent): ${tokenMint.slice(0, 8)}... (will fetch symbol from holdings API)`);
                    }
                    solAmount = receivedAmount; // stablecoin amount as ref
                    console.log(`[parse] ${sig}: SELL ${tokenSymbol}: ${tokenAmount} for ${receivedAmount.toFixed(4)} ${receivedSymbol}`);
                  } else {
                    // No clear asset, skip
                    console.log(`[parse] ${sig}: No clear SELL asset found`);
                  }
                } else if (receivedMint === SOL_MINT) {
                  // Received SOL → check what was sent
                  const sentNonStable = outgoingTransfers.filter((t: any) => {
                    const tMint = t?.tokenAddress || t?.mint;
                    return tMint !== SOL_MINT && !STABLECOIN_MINTS.includes(tMint);
                  });
                  
                  const sentStable = outgoingTransfers.filter((t: any) => {
                    const tMint = t?.tokenAddress || t?.mint;
                    return STABLECOIN_MINTS.includes(tMint);
                  });
                  
                  if (sentNonStable.length > 0) {
                    // Sold token for SOL → SELL that token
                    action = "SELL";
                    solFlow = "in";
                    const sentToken = sentNonStable.reduce((max: any, t: any) => {
                      return (Number(t?.tokenAmount ?? 0) > Number(max?.tokenAmount ?? 0)) ? t : max;
                    });
                    tokenMint = sentToken.tokenAddress || sentToken.mint;
                    const rawAmount = Number(sentToken.tokenAmount ?? 0);
                    const decimals = Number(sentToken.decimals ?? 0);
                    tokenAmount = rawAmount / Math.pow(10, decimals);
                    tokenSymbol = sentToken.tokenSymbol || KNOWN_TOKEN_SYMBOLS[tokenMint] || tokenMint.slice(0, 6).toUpperCase();
                    if (!sentToken.tokenSymbol && !KNOWN_TOKEN_SYMBOLS[tokenMint]) {
                      console.log(`[parse] ${sig}: New token detected (sold for SOL): ${tokenMint.slice(0, 8)}... (will fetch symbol from holdings API)`);
                    }
                    
                    // Check for SOL fees that may have been sent
                    const solFees = outgoingTransfers
                      .filter((t: any) => (t?.tokenAddress || t?.mint) === SOL_MINT)
                      .reduce((sum: number, t: any) => sum + Number(t?.tokenAmount ?? 0) / 1e9, 0);
                    
                    solAmount = receivedAmount;
                    if (solFees > 0.0001) {
                      console.log(`[parse] ${sig}: Note: ${solFees.toFixed(6)} SOL in fees detected`);
                    }
                    console.log(`[parse] ${sig}: SELL ${tokenSymbol}: ${tokenAmount} for ${receivedAmount.toFixed(4)} SOL`);
                  } else if (sentStable.length > 0) {
                    // Sold stablecoin for SOL → SELL stablecoin
                    action = "SELL";
                    solFlow = "in";
                    const sentToken = sentStable.reduce((max: any, t: any) => {
                      return (Number(t?.tokenAmount ?? 0) > Number(max?.tokenAmount ?? 0)) ? t : max;
                    });
                    tokenMint = sentToken.tokenAddress || sentToken.mint;
                    const rawAmount = Number(sentToken.tokenAmount ?? 0);
                    const decimals = STABLECOIN_DECIMALS[tokenMint] || Number(sentToken.decimals ?? 0);
                    tokenAmount = rawAmount / Math.pow(10, decimals);
                    tokenSymbol = sentToken.tokenSymbol || KNOWN_TOKEN_SYMBOLS[tokenMint] || tokenMint.slice(0, 6).toUpperCase();
                    solAmount = receivedAmount;
                    console.log(`[parse] ${sig}: SELL ${tokenSymbol}: ${tokenAmount} for ${receivedAmount.toFixed(4)} SOL`);
                  } else {
                    // Received SOL but no clear outgoing token found in transfers
                    // This likely means a token was sold for SOL, but Helius didn't capture it in changes
                    // Log for debugging and mark as SELL unknown token
                    console.log(`[parse] ${sig}: ⚠️ SOLD unknown token for ${receivedAmount.toFixed(4)} SOL (token transfer not captured by Helius). Outgoing transfers: ${JSON.stringify(outgoingTransfers.slice(0, 2))}`);
                    action = "SELL";
                    solFlow = "in";
                    tokenMint = "unknown";
                    tokenAmount = 0;
                    tokenSymbol = "???";
                    solAmount = receivedAmount;
                    console.log(`[parse] ${sig}: SELL ???: (unknown amount) for ${receivedAmount.toFixed(4)} SOL`);
                  }
                } else {
                  // Received other token → BUY that token
                  action = "BUY";
                  solFlow = "none";
                  tokenMint = receivedMint;
                  tokenAmount = receivedAmount;
                  tokenSymbol = receivedSymbol;
                  
                  // Find largest outgoing SOL
                  const solTransfers = outgoingTransfers.filter((t: any) => (t?.tokenAddress || t?.mint) === SOL_MINT);
                  const largestSOL = solTransfers.length > 0
                    ? solTransfers.reduce((max: any, t: any) => {
                        return (Number(t?.tokenAmount ?? 0) > Number(max?.tokenAmount ?? 0)) ? t : max;
                      })
                    : null;
                  
                  if (largestSOL) {
                    solAmount = Number(largestSOL.tokenAmount ?? 0);
                    solFlow = "out";
                    console.log(`[parse] ${sig}: BUY ${tokenSymbol}: ${tokenAmount} for ${solAmount.toFixed(4)} SOL`);
                  } else {
                    console.log(`[parse] ${sig}: BUY ${tokenSymbol}: ${tokenAmount}`);
                  }
                }
              } else {
                console.log(`[parse] ${sig}: No incoming tokens found`);
              }
              
              if (tokenMint) {
                console.log(`[parse] ${sig}: ✅ CREATED ${action} trade`);
                // Ensure timestamp is a Date
                let timestamp = tx?.timestamp;
                if (typeof timestamp === 'number') {
                  // Convert Unix timestamp to Date
                  if (timestamp < 10000000000) {
                    // Likely in seconds
                    timestamp = new Date(timestamp * 1000);
                  } else {
                    // Likely in milliseconds
                    timestamp = new Date(timestamp);
                  }
                } else if (!timestamp || !(timestamp instanceof Date)) {
                  timestamp = new Date();
                }
                
                // Determine what currency was actually received (within scope of receivedMint/receivedSymbol)
                let receivedCurrency = "SOL"; // default
                try {
                  if (receivedMint === SOL_MINT) {
                    receivedCurrency = "SOL";
                  } else if (STABLECOIN_MINTS.includes(receivedMint)) {
                    receivedCurrency = receivedSymbol || receivedMint.slice(0, 6).toUpperCase();
                  } else {
                    receivedCurrency = receivedSymbol || receivedMint.slice(0, 6).toUpperCase();
                  }
                } catch (e) {
                  // If anything goes wrong, just use symbol or SOL
                  receivedCurrency = receivedSymbol || "SOL";
                }
                
                return {
                  id: tx?.signature ?? "",
                  signature: tx?.signature ?? "",
                  shortSig: (tx?.signature ?? "").slice(0, 8) + "…" + (tx?.signature ?? "").slice(-4),
                  timestamp: timestamp,
                  action,
                  tokenMint,
                  tokenSymbol,
                  tokenAmount,
                  solAmount,
                  description: tx?.description ?? "",
                  source: isJupiter ? "JUPITER" : (tx?.source ?? "DEX"),
                  txUrl: `https://solscan.io/tx/${tx?.signature ?? ""}`,
                  solFlow,
                  sentMint: (tx as any)?.__sentMint__ || undefined,
                  receivedCurrency,
                } as RealTrade;
              }
            }
          
            // Standard swap event parsing
            if (swap) {
              const hasNativeIn = swap?.nativeInput && Number(swap.nativeInput.amount) > 0;
              const hasNativeOut = swap?.nativeOutput && Number(swap.nativeOutput.amount) > 0;
              const hasTokenOut = (swap?.tokenOutputs?.length ?? 0) > 0;
              const hasTokenIn = (swap?.tokenInputs?.length ?? 0) > 0;
              
              if (hasNativeOut && hasTokenIn) {
                // Received SOL, sent token → SELL that token
                const sentTok = swap.tokenInputs?.[0];
                if (sentTok?.mint) {
                  (tx as any).__sentMint__ = sentTok.mint;
                  tokenMint = sentTok.mint;
                  tokenAmount = Number(sentTok.rawTokenAmount?.tokenAmount ?? 0) / Math.pow(10, sentTok.rawTokenAmount?.decimals ?? 6);
                  action = "SELL";
                  solFlow = "in";
                  solAmount = Number(swap.nativeOutput.amount) / 1e9;
                } else {
                  return null;
                }
              } else if (hasNativeIn && hasTokenOut) {
                const out = swap.tokenOutputs?.[0];
                if (out?.mint) {
                  tokenMint = out.mint;
                  tokenAmount =
                    Number(out.rawTokenAmount?.tokenAmount ?? 0) /
                    Math.pow(10, out.rawTokenAmount?.decimals ?? 6);
                  solAmount = Number(swap.nativeInput.amount) / 1e9;
                  solFlow = "out";
                  action = STABLECOIN_MINTS.includes(tokenMint) ? "SELL" : "BUY";
                } else {
                  return null;
                }
              } else if (hasTokenIn && hasTokenOut) {
                const out = swap.tokenOutputs?.[0];
                if (out?.mint) {
                  tokenMint = out.mint;
                  tokenAmount =
                    Number(out.rawTokenAmount?.tokenAmount ?? 0) /
                    Math.pow(10, out.rawTokenAmount?.decimals ?? 6);
                  solFlow = "none";
                  action = STABLECOIN_MINTS.includes(tokenMint) ? "SELL" : "BUY";
                  solAmount = 0;
                } else {
                  return null;
                }
              } else {
                return null;
              }
            } // end if (swap)

            if (!tokenMint) return null;

            // Resolve symbol for non-SOL tokens
            if (!tokenSymbol) {
              if (tx?.tokenTransfers?.length > 0) {
                const match = tx.tokenTransfers.find((t: any) => (t?.mint === tokenMint || t?.tokenAddress === tokenMint));
                if (match?.symbol) tokenSymbol = match.symbol;
              }
              if (!tokenSymbol) {
                tokenSymbol = extractSymbolFromDescription(tx?.description || "", tokenMint);
              }
            }

            // Fix timestamp handling for both Unix seconds and milliseconds
            let timestamp = tx?.timestamp;
            if (typeof timestamp === 'number') {
              if (timestamp < 10000000000) {
                // Likely in seconds
                timestamp = new Date(timestamp * 1000);
              } else {
                // Likely in milliseconds
                timestamp = new Date(timestamp);
              }
            } else if (!timestamp || !(timestamp instanceof Date)) {
              timestamp = new Date();
            }

            // Determine received currency for display (safe with null checks)
            const receivedCurrency = !tokenMint 
              ? "???" 
              : tokenMint === "So11111111111111111111111111111111111111112" 
                ? "SOL" 
                : (tokenSymbol || tokenMint.slice(0, 6).toUpperCase());
            
            return {
              id: tx?.signature ?? "",
              signature: tx?.signature ?? "",
              shortSig: (tx?.signature ?? "").slice(0, 8) + "…" + (tx?.signature ?? "").slice(-4),
              timestamp: timestamp,
              action,
              tokenSymbol,
              tokenMint,
              solAmount,
              tokenAmount,
              description: tx?.description ?? "",
              source: isJupiter ? "JUPITER" : (tx?.source ?? "DEX"),
              txUrl: `https://solscan.io/tx/${tx?.signature ?? ""}`,
              solFlow,
              sentMint: (tx as any)?.__sentMint__ || undefined,
              receivedCurrency,
            } as RealTrade;
          } catch (err) {
            console.error(`[parse] Error processing tx ${idx}:`, err);
            return null;
          }
        })
        .filter((t): t is RealTrade => t !== null);

      // ── Win Rate: match opened positions (spent SOL on non-stablecoin) with
      //    closed positions (received SOL by sending that same non-stablecoin back).
      //    Trades oldest-first so we can FIFO-match positions chronologically.
      const chronological = [...parsed].reverse();
      const openPositions: Record<string, number[]> = {}; // mint → [solSpent, ...]
      const wins: boolean[] = [];

      for (const t of chronological) {
        if (t.solFlow === "out" && !STABLECOIN_MINTS.includes(t.tokenMint) && t.solAmount > 0) {
          // Opened a memecoin position (spent SOL to buy non-stablecoin)
          if (!openPositions[t.tokenMint]) openPositions[t.tokenMint] = [];
          openPositions[t.tokenMint].push(t.solAmount);
        } else if (
          t.solFlow === "in" &&
          t.sentMint &&
          !STABLECOIN_MINTS.includes(t.sentMint) &&
          t.solAmount > 0 &&
          openPositions[t.sentMint]?.length > 0
        ) {
          // Closed a memecoin position (received SOL back by selling that token)
          const solSpent = openPositions[t.sentMint].shift()!;
          wins.push(t.solAmount > solSpent); // win if we got back more SOL than we spent
        }
      }

      // Fallback when no matched pairs yet: derive from cumulative SOL flow direction.
      // Shows a meaningful number (100% if all flows are positive, else 0%) rather than "—".
      let wr: number | null = null;
      if (wins.length > 0) {
        wr = (wins.filter((w) => w).length / wins.length) * 100;
      } else if (parsed.length > 0) {
        const solIn = parsed.filter((t) => t.solFlow === "in").length;
        const solOut = parsed.filter((t) => t.solFlow === "out").length;
        const total = solIn + solOut;
        wr = total > 0 ? (solIn / total) * 100 : 100;
      }

      setTrades(parsed);
      setTotalTrades(parsed.length);
      setWinRate(wr);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch transactions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Delay first fetch by 1s, then poll every 5 minutes (conservative rate limiting)
    const initTimer = setTimeout(fetchTrades, 1000);
    const interval = setInterval(fetchTrades, 300000); // every 5 minutes
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [fetchTrades]);

  return { trades, totalTrades, winRate, loading, error, refresh: fetchTrades };
}

// ── Token Holdings (Alchemy RPC) ─────────────────────────────────────────────

export interface TokenHolding {
  mint: string;
  symbol: string;
  name: string;
  logo?: string;
  balance: number;
  decimals: number;
  priceUsd?: number;
  valueUsd?: number;
}

// Helper: Compute derived holdings from trade history
function computeDerivedHoldings(trades: RealTrade[]): Record<string, { tokenAmount: number; tokenSymbol: string; tokenMint: string }> {
  const holdings: Record<string, { tokenAmount: number; tokenSymbol: string; tokenMint: string }> = {};
  
  // Process trades in reverse chronological order (oldest first) to accumulate balances
  const sortedTrades = [...trades].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  for (const trade of sortedTrades) {
    if (trade.action === "BUY") {
      // BUY: add tokens
      if (!holdings[trade.tokenMint]) {
        holdings[trade.tokenMint] = {
          tokenAmount: 0,
          tokenSymbol: trade.tokenSymbol,
          tokenMint: trade.tokenMint,
        };
      }
      holdings[trade.tokenMint].tokenAmount += trade.tokenAmount;
    } else if (trade.action === "SELL") {
      // SELL: subtract tokens
      if (holdings[trade.tokenMint]) {
        holdings[trade.tokenMint].tokenAmount -= trade.tokenAmount;
      }
    }
  }
  
  // Filter out zero/negative balances
  return Object.fromEntries(
    Object.entries(holdings).filter(([_, h]) => h.tokenAmount > 0)
  );
}

export function useTokenHoldings() {
  const [holdings, setHoldings] = useState<TokenHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pausedUntilRef = useRef<number>(0);

  const fetchHoldings = useCallback(async () => {
    if (Date.now() < pausedUntilRef.current) return;

    try {
      const res = await fetch("/api/helius-holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: AGENT_WALLET }),
      });

      if (res.status === 429) {
        pausedUntilRef.current = Date.now() + 75000;
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      let tokens: TokenHolding[] = [];

      // 1. Parse API holdings
      if (data?.items) {
        tokens = data.items
          .filter(
            (item: any) =>
              item.interface === "FungibleToken" || item.interface === "FungibleAsset"
          )
          .map((item: any) => {
            const ti = item.token_info || {};
            const meta = item.content?.metadata || {};
            const decimals = ti.decimals ?? 0;
            const balance = (ti.balance ?? 0) / Math.pow(10, decimals);
            
            // Symbol resolution: API symbol → known map → fallback to mint
            let symbol = ti.symbol || meta.symbol;
            if (!symbol) {
              symbol = KNOWN_TOKEN_SYMBOLS[item.id] || item.id.slice(0, 6).toUpperCase();
            }
            
            return {
              mint: item.id,
              symbol,
              name: meta.name || ti.name || "Unknown Token",
              logo: item.content?.links?.image || undefined,
              balance,
              decimals,
              priceUsd: ti.price_info?.price_per_token ?? undefined,
              valueUsd: ti.price_info?.total_price ?? undefined,
            };
          })
          .filter((t: TokenHolding) => t.balance > 0);
      }

      setHoldings(tokens);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch holdings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Stagger 1s after mount, then poll every 3 minutes
    const initTimer = setTimeout(fetchHoldings, 1000);
    const interval = setInterval(fetchHoldings, 180000); // every 3 minutes
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [fetchHoldings]);

  return { holdings, loading, error, refresh: fetchHoldings };
}

// ── SOL Balance (Alchemy) ─────────────────────────────────────────────────────

export function useWalletSolBalance() {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pausedUntilRef = useRef<number>(0);

  const fetchBalance = useCallback(async () => {
    if (Date.now() < pausedUntilRef.current) return;

    try {
      const res = await fetch("/api/alchemy-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: AGENT_WALLET }),
      });

      if (res.status === 429) {
        pausedUntilRef.current = Date.now() + 60000;
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const bal = data.solBalance ?? 0;
      setBalance(bal);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch balance";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Stagger 1s after mount, then poll every 3 minutes
    const initTimer = setTimeout(fetchBalance, 1000);
    const interval = setInterval(fetchBalance, 180000); // every 3 minutes
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [fetchBalance]);

  return { balance, loading, error, refresh: fetchBalance };
}

// ── Network Congestion (Disabled) ─────────────────────────────────────────────

export type CongestionLevel = "Low" | "Medium" | "High" | "Unknown";

export interface NetworkStatus {
  tps: number | null;
  congestion: CongestionLevel;
  loading: boolean;
}

export function useNetworkCongestion(): NetworkStatus {
  return { tps: null, congestion: "Unknown", loading: false };
}
