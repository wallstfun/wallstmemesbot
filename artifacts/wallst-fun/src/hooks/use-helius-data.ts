import { useState, useEffect, useCallback, useRef } from "react";

export const AGENT_WALLET = "Hw7yc27h6Lws6YsQmdLoj4M7psyFHRhosFwoGuSESmTh";

// Known stablecoin mints (USDC, USDT, etc.)
const STABLECOIN_MINTS = [
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenEsw", // USDT
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

            // For Jupiter fills or swap-like txs without top-level swap event, parse from token changes
            if (!swap && (isJupiter || hasTransfers)) {
              console.log(`[parse] ${sig}: Processing without swap event (jupiter=${isJupiter}, transfers=${hasTransfers})`);
              const changes = tx?.tokenTransfers ?? [];
              
              if (!Array.isArray(changes) || changes.length < 2) {
                console.log(`[parse] ${sig}: DROPPED - <2 token transfers or not array`);
                return null;
              }
              
              const SOL_MINT = "So11111111111111111111111111111111111111112";
              // Support both tokenAddress (standard) and mint (alternative format from Helius)
              const solTransfer = changes.find((t: any) => (t?.tokenAddress || t?.mint) === SOL_MINT);
              
              if (solTransfer) {
                console.log(`[parse] ${sig}: Found SOL transfer(s)`);
                
                // Take the largest SOL transfer (actual trade amount, not fees/dust)
                const allSolTransfers = changes.filter((t: any) => (t?.tokenAddress || t?.mint) === SOL_MINT);
                let solAmount_raw = 0;
                allSolTransfers.forEach((transfer: any) => {
                  const amount = Number(transfer.tokenAmount ?? 0);
                  if (amount > 0) {
                    console.log(`[parse] ${sig}: SOL transfer: ${amount}`);
                    // Take the largest positive transfer as the actual trade
                    if (amount > solAmount_raw) {
                      solAmount_raw = amount;
                    }
                  }
                });
                
                if (!solAmount_raw) {
                  solAmount_raw = Number(solTransfer.tokenAmount ?? 0);
                }
                
                console.log(`[parse] ${sig}: Largest SOL transfer: ${solAmount_raw}`);
                
                if (solAmount_raw > 0) {
                  // SOL being received
                  console.log(`[parse] ${sig}: SOL received (${solAmount_raw} SOL) → BUY SOL`);
                  action = "BUY";
                  solFlow = "in";
                  solAmount = solAmount_raw;
                  tokenMint = SOL_MINT;
                  tokenSymbol = "SOL";
                  tokenAmount = solAmount;
                } else if (solAmount_raw < 0) {
                  // SOL being spent
                  console.log(`[parse] ${sig}: SOL spent (${Math.abs(solAmount_raw)} SOL) → BUY token`);
                  action = "BUY";
                  solFlow = "out";
                  solAmount = Math.abs(solAmount_raw);
                  
                  const receivedToken = changes.find((t: any) => (t?.tokenAddress || t?.mint) !== SOL_MINT && Number(t?.tokenAmount ?? 0) > 0);
                  if (receivedToken && (receivedToken.tokenAddress || receivedToken.mint)) {
                    tokenMint = receivedToken.tokenAddress || receivedToken.mint;
                    // Don't override tokenSymbol if we're swapping for SOL
                    if (!tokenSymbol || tokenSymbol === "SWAP") {
                      tokenSymbol = receivedToken.tokenSymbol || (tokenMint ? tokenMint.slice(0, 6) : "TOKEN");
                    }
                    // Only set tokenAmount if trading for another token (not SOL)
                    if (tokenMint !== SOL_MINT) {
                      tokenAmount = Number(receivedToken.tokenAmount ?? 0) / Math.pow(10, receivedToken.decimals ?? 0);
                    }
                    console.log(`[parse] ${sig}: Received token=${tokenSymbol}`);
                  }
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
                    txUrl: `https://solscan.io/tx/${sig}`,
                    solFlow,
                    sentMint: (tx as any)?.__sentMint__ || undefined,
                  } as RealTrade;
                }
              }
              console.log(`[parse] ${sig}: DROPPED - no valid SOL transfer`);
              return null;
            }
          
            // Standard swap event parsing
            if (swap) {
              const hasNativeIn = swap?.nativeInput && Number(swap.nativeInput.amount) > 0;
              const hasNativeOut = swap?.nativeOutput && Number(swap.nativeOutput.amount) > 0;
              const hasTokenOut = (swap?.tokenOutputs?.length ?? 0) > 0;
              const hasTokenIn = (swap?.tokenInputs?.length ?? 0) > 0;
              
              if (hasNativeOut && hasTokenIn) {
                action = "BUY";
                solFlow = "in";
                solAmount = Number(swap.nativeOutput.amount) / 1e9;
                tokenMint = "So11111111111111111111111111111111111111112";
                tokenSymbol = "SOL";
                tokenAmount = solAmount;
                const sentTok = swap.tokenInputs?.[0];
                if (sentTok?.mint) (tx as any).__sentMint__ = sentTok.mint;
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
              txUrl: `https://solscan.io/tx/${sig}`,
              solFlow,
              sentMint: (tx as any)?.__sentMint__ || undefined,
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
    // Delay first fetch by 3s, then poll every 5 minutes (conservative rate limiting)
    const initTimer = setTimeout(fetchTrades, 3000);
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

      if (data?.items) {
        const tokens: TokenHolding[] = data.items
          .filter(
            (item: any) =>
              item.interface === "FungibleToken" || item.interface === "FungibleAsset"
          )
          .map((item: any) => {
            const ti = item.token_info || {};
            const meta = item.content?.metadata || {};
            const decimals = ti.decimals ?? 0;
            const balance = (ti.balance ?? 0) / Math.pow(10, decimals);
            return {
              mint: item.id,
              symbol: ti.symbol || meta.symbol || item.id.slice(0, 5).toUpperCase(),
              name: meta.name || ti.name || "Unknown Token",
              logo: item.content?.links?.image || undefined,
              balance,
              decimals,
              priceUsd: ti.price_info?.price_per_token ?? undefined,
              valueUsd: ti.price_info?.total_price ?? undefined,
            };
          })
          .filter((t: TokenHolding) => t.balance > 0)
          .sort((a: TokenHolding, b: TokenHolding) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));

        setHoldings(tokens);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch holdings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Stagger 3s after mount (same as transactions), then poll every 3 minutes
    const initTimer = setTimeout(fetchHoldings, 3000);
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
    // Stagger 3s after mount, then poll every 3 minutes
    const initTimer = setTimeout(fetchBalance, 3000);
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
