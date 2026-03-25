import { useState, useEffect, useCallback } from "react";

export interface PumpToken {
  tokenAddress: string;
  name: string;
  symbol: string;
  logo?: string;
  marketCap?: number;
  priceChange24h?: number;
  priceUsd?: number;
  bondingProgress?: number;
  url?: string;
}

const MORALIS_API_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjJkOWY2ZmM0LTczZGEtNDEwZC1iYjVlLTk1N2VlMjI4OGU3NCIsIm9yZ0lkIjoiNTA2OTQ1IiwidXNlcklkIjoiNTIxNjE0IiwidHlwZUlkIjoiNjE1MTFhYTYtMTk5ZS00OWVkLThiODktNTc2YjI1NGMxOTkwIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NzQzOTQxMTUsImV4cCI6NDkzMDE1NDExNX0.bPd42MqB0lwTbLivIX-4pFReN-F0LgB3rMplN-UsnHQ";

export function useScopeTokens(limit = 3) {
  const [tokens, setTokens] = useState<PumpToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTokens = useCallback(async () => {
    try {
      const headers = {
        "X-API-Key": MORALIS_API_KEY,
        Accept: "application/json",
      };

      const [bondingRes, graduatedRes] = await Promise.all([
        fetch(
          "https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun/bonding?limit=50",
          { headers }
        ),
        fetch(
          "https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun/graduated?limit=50",
          { headers }
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
          priceChange24h: 0,
          priceUsd: parseFloat(token.priceUsd) || 0,
          bondingProgress: graduated ? 100 : token.bondingCurveProgress || 0,
          url: `https://pump.fun/${token.tokenAddress}`,
        });
      };

      (bondingData.result ?? []).forEach((t: any) => processToken(t, false));
      (graduatedData.result ?? []).forEach((t: any) => processToken(t, true));

      const unique = Array.from(
        new Map(allTokens.map((t) => [t.tokenAddress, t])).values()
      ).sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));

      setTokens(unique.slice(0, limit));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch tokens");
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchTokens();
    const interval = setInterval(fetchTokens, 45000);
    return () => clearInterval(interval);
  }, [fetchTokens]);

  return { tokens, loading, error };
}
