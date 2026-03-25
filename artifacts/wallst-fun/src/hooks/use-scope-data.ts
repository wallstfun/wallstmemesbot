import { useState, useEffect, useCallback, useRef } from "react";

export interface PumpToken {
  tokenAddress: string;
  name: string;
  symbol: string;
  logo?: string;
  marketCap?: number;
  priceChange24h?: number;
  priceChange1m?: number | null;
  priceChange5m?: number | null;
  priceUsd?: number;
  bondingProgress?: number;
  url?: string;
}

interface PriceSnapshot {
  price: number;
  ts: number;
}

const MORALIS_API_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjJkOWY2ZmM0LTczZGEtNDEwZC1iYjVlLTk1N2VlMjI4OGU3NCIsIm9yZ0lkIjoiNTA2OTQ1IiwidXNlcklkIjoiNTIxNjE0IiwidHlwZUlkIjoiNjE1MTFhYTYtMTk5ZS00OWVkLThiODktNTc2YjI1NGMxOTkwIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NzQzOTQxMTUsImV4cCI6NDkzMDE1NDExNX0.bPd42MqB0lwTbLivIX-4pFReN-F0LgB3rMplN-UsnHQ";

const MORALIS_HEADERS = {
  "X-API-Key": MORALIS_API_KEY,
  Accept: "application/json",
};

// Rolling 90-second price buffer — keyed by tokenAddress
// Gives us genuine 1-minute % change once the buffer has >= 60s of data
function compute1mChange(
  history: PriceSnapshot[],
  currentPrice: number,
  now: number
): number | null {
  if (history.length < 2 || currentPrice <= 0) return null;
  const oneMinAgo = now - 60_000;
  // Find the snapshot closest to (but not after) 60 seconds ago
  const candidate = [...history]
    .filter((h) => h.ts <= oneMinAgo + 10_000)
    .pop();
  if (!candidate || candidate.price <= 0) return null;
  return ((currentPrice - candidate.price) / candidate.price) * 100;
}

export function useScopeTokens(limit = 4) {
  const [tokens, setTokens] = useState<PumpToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Persists across renders; never causes re-renders itself
  const priceHistoryRef = useRef<Record<string, PriceSnapshot[]>>({});
  const topTokensRef = useRef<PumpToken[]>([]);

  // ── Step 1: Fetch the full bonding+graduated list (heavier, less frequent) ──
  const fetchList = useCallback(async () => {
    try {
      const [bondingRes, graduatedRes] = await Promise.all([
        fetch(
          "https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun/bonding?limit=50",
          { headers: MORALIS_HEADERS }
        ),
        fetch(
          "https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun/graduated?limit=50",
          { headers: MORALIS_HEADERS }
        ),
      ]);

      if (!bondingRes.ok || !graduatedRes.ok) {
        throw new Error(`API error: ${bondingRes.status} / ${graduatedRes.status}`);
      }

      const [bondingData, graduatedData] = await Promise.all([
        bondingRes.json(),
        graduatedRes.json(),
      ]);

      const allTokens: PumpToken[] = [];
      const processToken = (token: any, graduated: boolean) => {
        if (!token.tokenAddress || !token.symbol) return;
        allTokens.push({
          tokenAddress: token.tokenAddress,
          name: token.name || "Unknown",
          symbol: token.symbol,
          logo: token.logo,
          marketCap: parseFloat(token.fullyDilutedValuation) || 0,
          priceUsd: parseFloat(token.priceUsd) || 0,
          bondingProgress: graduated ? 100 : token.bondingCurveProgress || 0,
          url: `https://pump.fun/${token.tokenAddress}`,
          priceChange1m: null,
        });
      };

      (bondingData.result ?? []).forEach((t: any) => processToken(t, false));
      (graduatedData.result ?? []).forEach((t: any) => processToken(t, true));

      const unique = Array.from(
        new Map(allTokens.map((t) => [t.tokenAddress, t])).values()
      ).sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));

      const top = unique.slice(0, limit);
      topTokensRef.current = top;

      // Seed price history for any new tokens
      const now = Date.now();
      top.forEach((token) => {
        const price = token.priceUsd ?? 0;
        if (!priceHistoryRef.current[token.tokenAddress]) {
          priceHistoryRef.current[token.tokenAddress] = [];
        }
        priceHistoryRef.current[token.tokenAddress].push({ price, ts: now });
      });

      // First render — show tokens without 1m change yet
      setTokens(top.map((t) => ({ ...t, priceChange1m: null })));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch tokens");
    } finally {
      setLoading(false);
    }
  }, [limit]);

  // ── Step 2: Lightweight price refresh (every 15 s) using individual price API ──
  const fetchPrices = useCallback(async () => {
    const current = topTokensRef.current;
    if (current.length === 0) return;

    const now = Date.now();

    const results = await Promise.all(
      current.map(async (token) => {
        try {
          const res = await fetch(
            `https://solana-gateway.moralis.io/token/mainnet/${token.tokenAddress}/price`,
            { headers: MORALIS_HEADERS }
          );
          if (!res.ok) return null;
          const data = await res.json();
          const price = parseFloat(data.usdPrice) || 0;
          return { tokenAddress: token.tokenAddress, price };
        } catch {
          return null;
        }
      })
    );

    setTokens((prev) =>
      prev.map((token) => {
        const result = results.find((r) => r?.tokenAddress === token.tokenAddress);
        if (!result) return token;

        const price = result.price;
        const hist = priceHistoryRef.current[token.tokenAddress] ?? [];

        // Add snapshot and trim to 90-second window
        hist.push({ price, ts: now });
        priceHistoryRef.current[token.tokenAddress] = hist.filter(
          (h) => now - h.ts <= 90_000
        );

        const priceChange1m = compute1mChange(
          priceHistoryRef.current[token.tokenAddress],
          price,
          now
        );

        return { ...token, priceUsd: price, priceChange1m };
      })
    );
  }, []);

  useEffect(() => {
    fetchList();
    fetchPrices();

    const listInterval = setInterval(fetchList, 30_000);   // full list every 30s
    const priceInterval = setInterval(fetchPrices, 15_000); // prices every 15s

    return () => {
      clearInterval(listInterval);
      clearInterval(priceInterval);
    };
  }, [fetchList, fetchPrices]);

  return { tokens, loading, error };
}
