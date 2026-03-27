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
        .map((tx: any) => {
          const swap = tx.events?.swap;
          
          // Include Jupiter transactions even without a top-level swap event
          // Jupiter fill orders might not have the standard swap structure
          const isJupiter = tx.source === "JUPITER";
          if (!swap && !isJupiter) return null;

          const hasNativeIn = swap.nativeInput && Number(swap.nativeInput.amount) > 0;
          const hasNativeOut = swap.nativeOutput && Number(swap.nativeOutput.amount) > 0;
          const hasTokenOut = (swap.tokenOutputs?.length ?? 0) > 0;
          const hasTokenIn = (swap.tokenInputs?.length ?? 0) > 0;

          let action: RealTrade["action"] = "SWAP";
          let solAmount = 0;
          let tokenAmount = 0;
          let tokenMint = "";
          let tokenSymbol = "";
          let solFlow: RealTrade["solFlow"] = "none";

          // For Jupiter fills without swap event, parse from token changes
          if (!swap && isJupiter) {
            const changes = tx.tokenTransfers || [];
            
            // Find SOL transfers to determine direction
            const solSent = changes.find((t) => t.tokenAddress === "So11111111111111111111111111111111111111112" && Number(t.fromUserAccount ? t.tokenAmount : 0) > 0);
            const solReceived = changes.find((t) => t.tokenAddress === "So11111111111111111111111111111111111111112" && Number(t.toUserAccount ? t.tokenAmount : 0) > 0);
            
            if (solReceived) {
              // SOL received → BUY SOL
              action = "BUY";
              solFlow = "in";
              solAmount = Number(solReceived.tokenAmount ?? 0) / 1e9;
              tokenMint = "So11111111111111111111111111111111111111112";
              tokenSymbol = "SOL";
              tokenAmount = solAmount;
              // Track which token was sent
              const sentToken = changes.find((t) => t.tokenAddress !== "So11111111111111111111111111111111111111112");
              if (sentToken?.tokenAddress) (tx as any).__sentMint__ = sentToken.tokenAddress;
            } else if (solSent) {
              // SOL sent → SELL SOL or BUY token
              action = "BUY";
              solFlow = "out";
              solAmount = Number(solSent.tokenAmount ?? 0) / 1e9;
              const receivedToken = changes.find((t) => t.tokenAddress !== "So11111111111111111111111111111111111111112");
              if (receivedToken) {
                tokenMint = receivedToken.tokenAddress;
                tokenSymbol = receivedToken.tokenSymbol || receivedToken.tokenAddress.slice(0, 5);
                tokenAmount = Number(receivedToken.tokenAmount ?? 0) / Math.pow(10, receivedToken.decimals ?? 0);
              }
            }
            
            return {
              signature: tx.signature,
              timestamp: tx.timestamp,
              action,
              tokenMint,
              tokenSymbol,
              tokenAmount,
              solAmount,
              solFlow,
            } as RealTrade;
          }
          
          // Standard swap event parsing
          if (!swap) return null;
          
          if (hasNativeOut && hasTokenIn) {
            // Received SOL, sent a token (e.g. USDC → SOL, or memecoin → SOL)
            // The asset gained is SOL — always label as BUY SOL
            action = "BUY";
            solFlow = "in";
            solAmount = Number(swap.nativeOutput.amount) / 1e9;
            tokenMint = "So11111111111111111111111111111111111111112"; // native SOL
            tokenSymbol = "SOL";
            tokenAmount = solAmount; // amount of SOL received
            // Track which token was sent — needed for win rate matching
            const sentTok = swap.tokenInputs[0];
            if (sentTok?.mint) (tx as any).__sentMint__ = sentTok.mint;
          } else if (hasNativeIn && hasTokenOut) {
            // Sent SOL, received a token
            const out = swap.tokenOutputs[0];
            tokenMint = out.mint;
            tokenAmount =
              Number(out.rawTokenAmount?.tokenAmount ?? 0) /
              Math.pow(10, out.rawTokenAmount?.decimals ?? 6);
            solAmount = Number(swap.nativeInput.amount) / 1e9;
            solFlow = "out";
            // Classify by the received token: stablecoin = SELL, otherwise = BUY
            action = STABLECOIN_MINTS.includes(tokenMint) ? "SELL" : "BUY";
          } else if (hasTokenIn && hasTokenOut) {
            // Token-to-token swap (no SOL involved)
            const out = swap.tokenOutputs[0];
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

          if (!tokenMint) return null;

          // Resolve symbol for non-SOL tokens
          if (!tokenSymbol) {
            if (tx.tokenTransfers?.length > 0) {
              const match = tx.tokenTransfers.find((t: any) => t.mint === tokenMint);
              if (match?.symbol) tokenSymbol = match.symbol;
            }
            if (!tokenSymbol) {
              tokenSymbol = extractSymbolFromDescription(tx.description || "", tokenMint);
            }
          }

          const sig: string = tx.signature ?? "";
          return {
            id: sig,
            signature: sig,
            shortSig: sig.slice(0, 8) + "…" + sig.slice(-4),
            timestamp: new Date((tx.timestamp ?? 0) * 1000),
            action,
            tokenSymbol,
            tokenMint,
            solAmount,
            tokenAmount,
            description: tx.description ?? "",
            source: tx.source ?? "DEX",
            txUrl: `https://solscan.io/tx/${sig}`,
            solFlow,
            sentMint: (tx as any).__sentMint__ || undefined,
          } as RealTrade;
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
