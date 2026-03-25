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
}

const MIN_MCAP = 20_000;
const BIRDEYE_URL =
  "/proxy/birdeye/defi/token_trending?sort_by=rank&sort_type=asc&limit=20";

async function fetchBirdeyeTrending(): Promise<PumpToken[]> {
  const res = await fetch(BIRDEYE_URL, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Birdeye API error: ${res.status}`);
  const json = await res.json();
  const items: any[] = json?.data?.tokens ?? json?.data?.items ?? [];

  const tokens: PumpToken[] = [];
  for (const item of items) {
    const mcap = item.marketcap ?? 0;
    if (mcap < MIN_MCAP) continue;

    tokens.push({
      tokenAddress: item.address,
      name: item.name || "Unknown",
      symbol: item.symbol || item.address?.slice(0, 6).toUpperCase() || "???",
      logo: item.logoURI,
      marketCap: mcap,
      priceUsd: item.price ?? 0,
      priceChange24h: item.price24hChangePercent ?? null,
      priceChange1m: null,
      bondingProgress:
        item.liquidity > 0 && mcap > 0
          ? Math.min((item.liquidity / mcap) * 100, 100)
          : 0,
      url: `https://birdeye.so/token/${item.address}?chain=solana`,
      viewers: item.volume24hUSD ?? 0,
    });
  }

  return tokens;
}

export function useScopeTokens(limit = 4) {
  const [tokens, setTokens] = useState<PumpToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tokenCacheRef = useRef<PumpToken[]>([]);

  const poll = useCallback(async () => {
    try {
      let coins = await fetchBirdeyeTrending().catch(() => null);

      if (!coins || coins.length === 0) {
        if (tokenCacheRef.current.length > 0) {
          coins = tokenCacheRef.current;
        } else {
          throw new Error("No data available");
        }
      }

      tokenCacheRef.current = coins;
      setTokens(coins.slice(0, limit));
      setError(null);
    } catch (err) {
      if (tokenCacheRef.current.length === 0) {
        setError(err instanceof Error ? err.message : "Failed to fetch tokens");
      }
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 30_000);
    return () => clearInterval(interval);
  }, [poll]);

  return { tokens, loading, error };
}
