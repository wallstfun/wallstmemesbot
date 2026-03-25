import { useState, useEffect, useCallback, useRef } from "react";

export interface PumpToken {
  tokenAddress: string;
  name: string;
  symbol: string;
  logo?: string;
  marketCap?: number;
  priceChange24h?: number | null;
  priceChange1m?: number | null;
  priceUsd?: number;
  bondingProgress?: number;
  url?: string;
  viewers?: number;
  source?: "moralis" | "dexscreener";
}

const POLL_INTERVAL = 4 * 60 * 1000; // 4 minutes — matches backend caching

// Module-level cache — shared across all hook instances to prevent duplicate fetches
let moduleCache: PumpToken[] = [];
let lastFetchTime = 0;
let inFlight: Promise<PumpToken[]> | null = null;

// ── DexScreener API (Direct) ────────────────────────────────────────────────
async function fetchTrendingTokens(): Promise<PumpToken[]> {
  const MIN_MCAP = 10_000;

  try {
    const boostRes = await fetch("https://api.dexscreener.com/token-boosts/top/v1");
    if (!boostRes.ok) throw new Error(`DexScreener boosts HTTP ${boostRes.status}`);

    const boosts = await boostRes.json();
    const addrs = boosts
      .filter((b: any) => b.chainId === "solana")
      .slice(0, 50)
      .map((b: any) => b.tokenAddress)
      .join(",");

    if (!addrs) return [];

    const pairsRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addrs}`);
    if (!pairsRes.ok) throw new Error(`DexScreener pairs HTTP ${pairsRes.status}`);

    const pairsJson = await pairsRes.json();
    const pairs: any[] = pairsJson.pairs ?? [];

    // Keep highest-liquidity pair per base token
    const byAddr = new Map<string, any>();
    for (const p of pairs) {
      if (p.chainId !== "solana") continue;
      const a = p.baseToken?.address ?? "";
      if (!a) continue;
      const cur = byAddr.get(a);
      if (!cur || (p.liquidity?.usd ?? 0) > (cur.liquidity?.usd ?? 0)) byAddr.set(a, p);
    }

    const tokens = Array.from(byAddr.values())
      .filter((p) => (p.marketCap ?? 0) >= MIN_MCAP)
      .slice(0, 20)
      .map((p) => ({
        tokenAddress: p.baseToken?.address ?? "",
        name: p.baseToken?.name || "Unknown",
        symbol: p.baseToken?.symbol || "???",
        logo: p.info?.imageUrl,
        marketCap: p.marketCap ?? p.fdv ?? 0,
        priceUsd: parseFloat(p.priceUsd ?? "0"),
        priceChange24h: p.priceChange?.h24 ?? null,
        volume24h: (p.volume?.h24 ?? 0),
        url: `https://dexscreener.com/solana/${p.baseToken?.address}`,
        source: "dexscreener",
      }));

    // Map to PumpToken interface
    return tokens.map((item) => ({
      tokenAddress: item.tokenAddress || "",
      name: item.name || "Unknown",
      symbol: item.symbol || "???",
      logo: item.logo,
      marketCap: item.marketCap ?? 0,
      priceUsd: item.priceUsd ?? 0,
      priceChange24h: item.priceChange24h ?? null,
      priceChange1m: null,
      bondingProgress: 0,
      url: item.url || "#",
      viewers: item.volume24h ?? 0,
      source: item.source,
    }));
  } catch (err) {
    console.warn("DexScreener fetch failed:", err);
    return [];
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────
export function useScopeTokens(limit = 4) {
  const [tokens, setTokens] = useState<PumpToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tokenCacheRef = useRef<PumpToken[]>([]);

  const poll = useCallback(async () => {
    try {
      const coins = await fetchTrendingTokens();

      if (coins && coins.length > 0) {
        tokenCacheRef.current = coins;
        setTokens(coins.slice(0, limit));
        setError(null);
      } else if (tokenCacheRef.current.length > 0) {
        setTokens(tokenCacheRef.current.slice(0, limit));
      } else {
        setError("No trending tokens available");
      }
    } catch (err) {
      // Show stale data rather than wiping the UI on errors
      if (tokenCacheRef.current.length > 0) {
        setTokens(tokenCacheRef.current.slice(0, limit));
      } else {
        setError(err instanceof Error ? err.message : "Failed to fetch tokens");
      }
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [poll]);

  return { tokens, loading, error };
}
