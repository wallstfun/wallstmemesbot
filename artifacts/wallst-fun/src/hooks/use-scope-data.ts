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

// ── Backend API (Moralis + DexScreener) ────────────────────────────────────
async function fetchTrendingTokens(): Promise<PumpToken[]> {
  const res = await fetch("/api/tokens/trending");
  if (!res.ok) {
    throw new Error(`Failed to fetch trending tokens: HTTP ${res.status}`);
  }
  const json = await res.json();
  const tokens: any[] = json.tokens || [];

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
    bondingProgress: 0, // Backend doesn't provide this
    url: item.url || "#",
    viewers: item.volume24h ?? 0,
    source: item.source,
  }));
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
