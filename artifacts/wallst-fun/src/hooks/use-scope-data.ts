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
const POLL_INTERVAL = 10 * 60 * 1000; // 10 minutes — preserves Birdeye compute units

const BIRDEYE_API_KEY =
  import.meta.env.VITE_BIRDEYE_API_KEY || "41a3c0487a6b451abd0e258f9a77493a";

// Module-level cache — shared across all hook instances to prevent duplicate fetches
let moduleCache: PumpToken[] = [];
let lastFetchTime = 0;
let inFlight: Promise<PumpToken[]> | null = null;

// ── Birdeye ────────────────────────────────────────────────────────────────
async function fetchBirdeye(): Promise<PumpToken[]> {
  const res = await fetch(
    "https://public-api.birdeye.so/defi/token_trending?sort_by=rank&sort_type=asc&limit=20",
    {
      headers: {
        Accept: "application/json",
        "X-API-KEY": BIRDEYE_API_KEY,
        "x-chain": "solana",
      },
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.message ?? `Birdeye HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json?.success === false) throw new Error(json.message ?? "Birdeye error");

  const items: any[] = json?.data?.tokens ?? json?.data?.items ?? [];
  return items
    .filter((item) => (item.marketcap ?? 0) >= MIN_MCAP)
    .map((item) => ({
      tokenAddress: item.address,
      name: item.name || "Unknown",
      symbol: item.symbol || item.address?.slice(0, 6).toUpperCase() || "???",
      logo: item.logoURI,
      marketCap: item.marketcap ?? 0,
      priceUsd: item.price ?? 0,
      priceChange24h: item.price24hChangePercent ?? null,
      priceChange1m: null,
      bondingProgress:
        item.liquidity > 0 && (item.marketcap ?? 0) > 0
          ? Math.min((item.liquidity / item.marketcap) * 100, 100)
          : 0,
      url: `https://birdeye.so/token/${item.address}?chain=solana`,
      viewers: item.volume24hUSD ?? 0,
    }));
}

// ── DexScreener fallback ───────────────────────────────────────────────────
async function fetchDexScreener(): Promise<PumpToken[]> {
  // Step 1: get top boosted Solana token addresses
  const boostRes = await fetch("https://api.dexscreener.com/token-boosts/top/v1");
  if (!boostRes.ok) throw new Error(`DexScreener boosts HTTP ${boostRes.status}`);
  const boosts: any[] = await boostRes.json();

  const solanaAddresses = boosts
    .filter((b) => b.chainId === "solana")
    .slice(0, 30)
    .map((b) => b.tokenAddress);

  if (solanaAddresses.length === 0) return [];

  // Step 2: fetch pair data (price, marketCap, etc.) for those addresses
  const pairsRes = await fetch(
    `https://api.dexscreener.com/latest/dex/tokens/${solanaAddresses.join(",")}`,
  );
  if (!pairsRes.ok) throw new Error(`DexScreener pairs HTTP ${pairsRes.status}`);
  const pairsJson = await pairsRes.json();
  const pairs: any[] = pairsJson.pairs ?? [];

  // Group by base token address, keep highest-liquidity pair per token
  const byAddress = new Map<string, any>();
  for (const pair of pairs) {
    if (pair.chainId !== "solana") continue;
    const addr = pair.baseToken?.address ?? "";
    if (!addr) continue;
    const existing = byAddress.get(addr);
    if (!existing || (pair.liquidity?.usd ?? 0) > (existing.liquidity?.usd ?? 0)) {
      byAddress.set(addr, pair);
    }
  }

  return Array.from(byAddress.values())
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
      priceChange1m: null,
      bondingProgress:
        (p.liquidity?.usd ?? 0) > 0 && (p.marketCap ?? 0) > 0
          ? Math.min(((p.liquidity.usd) / p.marketCap) * 100, 100)
          : 0,
      url: p.url ?? `https://dexscreener.com/solana/${p.baseToken?.address}`,
      viewers: p.volume?.h24 ?? 0,
    }));
}

// ── Primary fetch with automatic fallback ─────────────────────────────────
async function fetchTrendingTokens(): Promise<PumpToken[]> {
  const now = Date.now();

  if (moduleCache.length > 0 && now - lastFetchTime < POLL_INTERVAL) {
    return moduleCache;
  }

  if (inFlight) return inFlight;

  inFlight = (async () => {
    let tokens: PumpToken[] = [];

    // Try Birdeye first
    try {
      tokens = await fetchBirdeye();
    } catch (birdeyeErr) {
      console.warn("[Scope] Birdeye failed, trying DexScreener:", (birdeyeErr as Error).message);
      // Fallback to DexScreener
      tokens = await fetchDexScreener();
    }

    if (tokens.length > 0) {
      moduleCache = tokens;
      lastFetchTime = Date.now();
    }

    return tokens.length > 0 ? tokens : moduleCache;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
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
