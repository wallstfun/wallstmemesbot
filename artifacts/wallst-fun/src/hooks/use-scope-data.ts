import { useState, useEffect, useCallback, useRef } from "react";

export interface PumpToken {
  tokenAddress: string;
  name: string;
  symbol: string;
  logo?: string;
  marketCap?: number;
  priceChange24h?: number;
  priceChange1m?: number | null;
  priceUsd?: number;
  bondingProgress?: number;
  url?: string;
}

interface McapSnapshot {
  mcap: number; // usd_market_cap used as price proxy (mcap % change == price % change)
  ts: number;
}

const MIN_MCAP = 20_000; // $20k minimum market cap
const PUMP_FUN_URL =
  "/proxy/pumpfun/coins?offset=0&limit=50&sort=market_cap&order=DESC&includeNsfw=false";

function compute1mChange(
  history: McapSnapshot[],
  currentMcap: number,
  now: number
): number | null {
  if (history.length < 2 || currentMcap <= 0) return null;
  // Look for the snapshot closest to 60 seconds ago (±20s window)
  const target = now - 60_000;
  const candidate = [...history]
    .filter((h) => h.ts <= target + 20_000 && h.ts >= target - 20_000)
    .sort((a, b) => Math.abs(a.ts - target) - Math.abs(b.ts - target))[0];
  if (!candidate || candidate.mcap <= 0) return null;
  return ((currentMcap - candidate.mcap) / candidate.mcap) * 100;
}

async function fetchPumpFunCoins(): Promise<PumpToken[]> {
  const res = await fetch(PUMP_FUN_URL, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Pump.fun API error: ${res.status}`);
  const coins: any[] = await res.json();

  const tokens: PumpToken[] = [];
  for (const coin of coins ?? []) {
    const mcap = coin.usd_market_cap ?? 0;
    if (mcap < MIN_MCAP) continue;

    // Derive per-token price: pump.fun tokens have 1B supply (6 decimals)
    const supply = coin.total_supply > 0 ? coin.total_supply : 1_000_000_000;
    const priceUsd = mcap / supply;

    tokens.push({
      tokenAddress: coin.mint,
      name: coin.name || "Unknown",
      symbol: coin.symbol || coin.mint?.slice(0, 6).toUpperCase() || "???",
      logo: coin.image_uri,
      marketCap: mcap,
      priceUsd,
      bondingProgress: coin.complete ? 100 : (coin.bonding_curve_progress ?? 0),
      url: `https://pump.fun/${coin.mint}`,
      priceChange1m: null,
    });
  }

  return tokens; // already sorted DESC by market_cap from API
}

export function useScopeTokens(limit = 4) {
  const [tokens, setTokens] = useState<PumpToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // mcap history per address — used to compute 1m change
  const mcapHistoryRef = useRef<Record<string, McapSnapshot[]>>({});
  const tokenCacheRef = useRef<PumpToken[]>([]);

  const poll = useCallback(async () => {
    try {
      let coins = await fetchPumpFunCoins().catch(() => null);

      // Fallback: use cache if API failed
      if (!coins || coins.length === 0) {
        if (tokenCacheRef.current.length > 0) {
          coins = tokenCacheRef.current.slice(0, limit);
        } else {
          throw new Error("No data available");
        }
      }

      tokenCacheRef.current = coins;
      const top = coins.slice(0, limit);
      const now = Date.now();

      setTokens(
        top.map((token) => {
          const mcap = token.marketCap ?? 0;
          if (mcap > 0) {
            const hist = mcapHistoryRef.current[token.tokenAddress] ?? [];
            hist.push({ mcap, ts: now });
            // Keep a 2-minute rolling window
            mcapHistoryRef.current[token.tokenAddress] = hist.filter(
              (h) => now - h.ts <= 120_000
            );
          }

          const priceChange1m = compute1mChange(
            mcapHistoryRef.current[token.tokenAddress] ?? [],
            mcap,
            now
          );

          return { ...token, priceChange1m };
        })
      );

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
    // 10s polls: fresh enough for 1m change AND good live data
    const interval = setInterval(poll, 10_000);
    return () => clearInterval(interval);
  }, [poll]);

  return { tokens, loading, error };
}
