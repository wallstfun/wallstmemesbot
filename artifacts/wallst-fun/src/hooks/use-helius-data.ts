import { useState, useEffect, useCallback } from "react";

export const AGENT_WALLET = "Hw7yc27h6Lws6YsQmdLoj4M7psyFHRhosFwoGuSESmTh";
const HELIUS_API_KEY = "54385120-20ac-4baa-9774-3f7ba8ccd656";
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const HELIUS_V0_URL = `https://api-mainnet.helius-rpc.com/v0`;

const rpc = async (method: string, params: unknown[]) => {
  const res = await fetch(HELIUS_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
};

// ── SOL Balance ──────────────────────────────────────────────────────────────

export function useWalletSolBalance() {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    try {
      const result = await rpc("getBalance", [AGENT_WALLET]);
      setBalance(result.value / 1e9);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch balance");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 15000);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  return { balance, loading, error, refresh: fetchBalance };
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
      const res = await fetch(HELIUS_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "das",
          method: "getAssetsByOwner",
          params: {
            ownerAddress: AGENT_WALLET,
            page: 1,
            limit: 1000,
            displayOptions: { showFungible: true, showNativeBalance: true },
          },
        }),
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
  // Helius descriptions look like: "Account swapped 0.1 SOL for 123 BONK on Raydium."
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

  const fetchTrades = useCallback(async () => {
    try {
      const url = `${HELIUS_V0_URL}/addresses/${AGENT_WALLET}/transactions/?api-key=${HELIUS_API_KEY}&limit=100&type=SWAP`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

          // Try to pull the symbol from tokenTransfers metadata
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

      // Win rate: match BUYs to SELLs per token (FIFO), compare SOL amounts
      const buyQueue: Record<string, number[]> = {};
      const wins: boolean[] = [];

      // Process oldest → newest to match buy → sell pairs
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

// ── Network Congestion (via getRecentPerformanceSamples) ─────────────────────

export type CongestionLevel = "Low" | "Medium" | "High" | "Unknown";

export interface NetworkStatus {
  tps: number | null;
  congestion: CongestionLevel;
  loading: boolean;
}

export function useNetworkCongestion(): NetworkStatus {
  return { tps: null, congestion: "Unknown", loading: false };
}
