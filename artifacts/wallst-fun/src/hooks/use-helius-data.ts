import { useState, useEffect, useCallback } from "react";

export const AGENT_WALLET = "Hw7yc27h6Lws6YsQmdLoj4M7psyFHRhosFwoGuSESmTh";

// ── Real Swap Transactions (Enhanced TX API) ──────────────────────────────────

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
  const [isPaused, setIsPaused] = useState(false);
  const [pauseUntil, setPauseUntil] = useState<number>(0);

  const fetchTrades = useCallback(async () => {
    // Check if paused due to rate limiting both keys
    if (isPaused && Date.now() < pauseUntil) {
      const remainingSeconds = Math.ceil((pauseUntil - Date.now()) / 1000);
      setError(`Rate limit hit on both keys. Pausing for ${remainingSeconds}s...`);
      return;
    }

    // If was paused, add 3-5s delay before resuming
    if (isPaused) {
      setIsPaused(false);
      setPauseUntil(0);
      const resumeDelay = 3000 + Math.random() * 2000; // 3-5 seconds
      await new Promise(resolve => setTimeout(resolve, resumeDelay));
    }

    try {
      // Call the server proxy route instead of Helius directly
      const res = await fetch("/api/helius-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: AGENT_WALLET }),
      });

      if (res.status === 429) {
        const data = await res.json();
        const retryAfter = data.retryAfter || 60;
        
        // Both keys failed - pause for 60 seconds
        setIsPaused(true);
        setPauseUntil(Date.now() + retryAfter * 1000);
        setError(`Rate limit hit on both keys. Pausing for ${retryAfter}s...`);
        console.warn(`Both API keys rate-limited (429). Pausing for ${retryAfter}s...`);
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setError(null); // Clear error on success
      const txs: any[] = await res.json();

      if (!Array.isArray(txs)) throw new Error("Unexpected response format");

      const parsed: RealTrade[] = txs
        .map((tx: any) => {
          const swap = tx.events?.swap;
          if (!swap) return null;

          const hasNativeIn =
            swap.nativeInput && Number(swap.nativeInput.amount) > 0;
          const hasNativeOut =
            swap.nativeOutput && Number(swap.nativeOutput.amount) > 0;
          const hasTokenOut = (swap.tokenOutputs?.length ?? 0) > 0;
          const hasTokenIn = (swap.tokenInputs?.length ?? 0) > 0;

          let action: RealTrade["action"] = "SWAP";
          let solAmount = 0;
          let tokenAmount = 0;
          let tokenMint = "";

          if (hasNativeIn && hasTokenOut) {
            action = "BUY";
            solAmount = Number(swap.nativeInput.amount) / 1e9;
            const out = swap.tokenOutputs[0];
            tokenMint = out.mint;
            tokenAmount =
              Number(out.rawTokenAmount?.tokenAmount ?? 0) /
              Math.pow(10, out.rawTokenAmount?.decimals ?? 6);
          } else if (hasNativeOut && hasTokenIn) {
            action = "SELL";
            solAmount = Number(swap.nativeOutput.amount) / 1e9;
            const inp = swap.tokenInputs[0];
            tokenMint = inp.mint;
            tokenAmount =
              Number(inp.rawTokenAmount?.tokenAmount ?? 0) /
              Math.pow(10, inp.rawTokenAmount?.decimals ?? 6);
          } else if (hasTokenIn && hasTokenOut) {
            action = "SWAP";
            const out = swap.tokenOutputs[0];
            tokenMint = out.mint;
            tokenAmount =
              Number(out.rawTokenAmount?.tokenAmount ?? 0) /
              Math.pow(10, out.rawTokenAmount?.decimals ?? 6);
          } else {
            return null;
          }

          if (!tokenMint) return null;

          let tokenSymbol = "";
          if (tx.tokenTransfers?.length > 0) {
            const match = tx.tokenTransfers.find(
              (t: any) => t.mint === tokenMint
            );
            if (match?.symbol) tokenSymbol = match.symbol;
          }
          if (!tokenSymbol) {
            tokenSymbol = extractSymbolFromDescription(
              tx.description || "",
              tokenMint
            );
          }

          const sig: string = tx.signature ?? "";

          return {
            id: sig,
            signature: sig,
            shortSig: sig.slice(0, 8) + "..." + sig.slice(-4),
            timestamp: new Date((tx.timestamp ?? 0) * 1000),
            action,
            tokenSymbol,
            tokenMint,
            solAmount,
            tokenAmount,
            description: tx.description ?? "",
            source: tx.source ?? "DEX",
            txUrl: `https://solscan.io/tx/${sig}`,
          } as RealTrade;
        })
        .filter((t): t is RealTrade => t !== null);

      // ── Compute derived stats from parsed trades ──────────────────────────
      const totalTrades = parsed.length;

      const buyQueue: Record<string, number[]> = {};
      const wins: boolean[] = [];

      const chronological = [...parsed].reverse();
      for (const t of chronological) {
        if (t.action === "BUY" && t.tokenMint && t.solAmount > 0) {
          if (!buyQueue[t.tokenMint]) buyQueue[t.tokenMint] = [];
          buyQueue[t.tokenMint].push(t.solAmount);
        }
      }
      for (const t of chronological) {
        if (
          t.action === "SELL" &&
          t.tokenMint &&
          t.solAmount > 0 &&
          buyQueue[t.tokenMint]?.length > 0
        ) {
          const buySOL = buyQueue[t.tokenMint].shift()!;
          wins.push(t.solAmount > buySOL);
        }
      }
      const winRate =
        wins.length > 0
          ? (wins.filter((w) => w).length / wins.length) * 100
          : null;

      setTrades(parsed);
      setTotalTrades(totalTrades);
      setWinRate(winRate);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch transactions"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrades();
    const interval = setInterval(fetchTrades, 90000);
    return () => clearInterval(interval);
  }, [fetchTrades]);

  return { trades, totalTrades, winRate, loading, error, refresh: fetchTrades };
}

// ── Token Holdings (DAS API) ─────────────────────────────────────────────────

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

  const fetchHoldings = useCallback(async () => {
    try {
      const res = await fetch("/api/helius-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: AGENT_WALLET }),
      });
      const data = await res.json();

      if (data.result?.items) {
        const tokens: TokenHolding[] = data.result.items
          .filter(
            (item: any) =>
              item.interface === "FungibleToken" ||
              item.interface === "FungibleAsset"
          )
          .map((item: any) => {
            const ti = item.token_info || {};
            const meta = item.content?.metadata || {};
            const decimals = ti.decimals ?? 0;
            const balance = (ti.balance ?? 0) / Math.pow(10, decimals);
            return {
              mint: item.id,
              symbol:
                ti.symbol ||
                meta.symbol ||
                item.id.slice(0, 5).toUpperCase(),
              name: meta.name || ti.name || "Unknown Token",
              logo: item.content?.links?.image || undefined,
              balance,
              decimals,
              priceUsd: ti.price_info?.price_per_token ?? undefined,
              valueUsd: ti.price_info?.total_price ?? undefined,
            };
          })
          .filter((t: TokenHolding) => t.balance > 0)
          .sort(
            (a: TokenHolding, b: TokenHolding) =>
              (b.valueUsd ?? 0) - (a.valueUsd ?? 0)
          );

        setHoldings(tokens);
        setError(null);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch holdings"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHoldings();
    const interval = setInterval(fetchHoldings, 90000);
    return () => clearInterval(interval);
  }, [fetchHoldings]);

  return { holdings, loading, error, refresh: fetchHoldings };
}

// ── SOL Balance ──────────────────────────────────────────────────────────────

export function useWalletSolBalance() {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/helius-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: AGENT_WALLET }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const bal = data.balance ?? 0;
      setBalance(bal);
      setError(null);
      console.log(`[wallst.fun] SOL balance fetched: ${bal.toFixed(4)} SOL`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch balance";
      setError(errorMessage);
      console.error(`[wallst.fun] Balance fetch error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 30000); // Every 30 seconds
    return () => clearInterval(interval);
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
