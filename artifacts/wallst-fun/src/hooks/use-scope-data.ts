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

interface PriceSnapshot {
  price: number;
  ts: number;
}

const BIRDEYE_API_KEY = "41a3c0487a6b451abd0e258f9a77493a";
const BIRDEYE_HEADERS = {
  "X-API-KEY": BIRDEYE_API_KEY,
  "x-chain": "solana",
  Accept: "application/json",
};

// Moralis kept as fallback only
const MORALIS_API_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjJkOWY2ZmM0LTczZGEtNDEwZC1iYjVlLTk1N2VlMjI4OGU3NCIsIm9yZ0lkIjoiNTA2OTQ1IiwidXNlcklkIjoiNTIxNjE0IiwidHlwZUlkIjoiNjE1MTFhYTYtMTk5ZS00OWVkLThiODktNTc2YjI1NGMxOTkwIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NzQzOTQxMTUsImV4cCI6NDkzMDE1NDExNX0.bPd42MqB0lwTbLivIX-4pFReN-F0LgB3rMplN-UsnHQ";
const MORALIS_HEADERS = {
  "X-API-Key": MORALIS_API_KEY,
  Accept: "application/json",
};

function compute1mChange(
  history: PriceSnapshot[],
  currentPrice: number,
  now: number
): number | null {
  if (history.length < 2 || currentPrice <= 0) return null;
  const oneMinAgo = now - 60_000;
  const candidate = [...history]
    .filter((h) => h.ts <= oneMinAgo + 15_000)
    .pop();
  if (!candidate || candidate.price <= 0) return null;
  return ((currentPrice - candidate.price) / candidate.price) * 100;
}

// Fetch top Pump.fun tokens from DexScreener (no API key, generous limits)
async function fetchPumpFunTokensDexScreener(): Promise<PumpToken[]> {
  const res = await fetch(
    "https://api.dexscreener.com/latest/dex/search?q=pump.fun&chainId=solana",
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`DexScreener error: ${res.status}`);
  const data = await res.json();

  const seen = new Set<string>();
  const tokens: PumpToken[] = [];
  for (const pair of data?.pairs ?? []) {
    if (pair.chainId !== "solana") continue;
    const addr = pair.baseToken?.address ?? "";
    if (!addr.endsWith("pump")) continue;
    if (seen.has(addr)) continue;
    seen.add(addr);
    tokens.push({
      tokenAddress: addr,
      name: pair.baseToken?.name || "Unknown",
      symbol: pair.baseToken?.symbol || addr.slice(0, 6).toUpperCase(),
      logo: pair.info?.imageUrl,
      marketCap: pair.fdv ?? 0,
      priceUsd: parseFloat(pair.priceUsd ?? "0") || 0,
      bondingProgress: 100,
      url: `https://pump.fun/${addr}`,
      priceChange1m: null,
    });
  }
  return tokens.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
}

// Moralis Pump.fun bonding+graduated fallback
async function fetchPumpFunTokensMoralis(): Promise<PumpToken[]> {
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
    throw new Error(`Moralis API error: ${bondingRes.status} / ${graduatedRes.status}`);
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

  return Array.from(
    new Map(allTokens.map((t) => [t.tokenAddress, t])).values()
  ).sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
}

export function useScopeTokens(limit = 4) {
  const [tokens, setTokens] = useState<PumpToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const priceHistoryRef = useRef<Record<string, PriceSnapshot[]>>({});
  const topTokensRef = useRef<PumpToken[]>([]);
  const tokenCacheRef = useRef<PumpToken[]>([]);

  // Seed the 90-second price buffer from Birdeye OHLCV so 1m % appears instantly.
  // Sequential with 250ms gaps to stay within Birdeye rate limits.
  const seedOhlcvHistory = useCallback(async (addresses: string[]) => {
    const now = Date.now();
    const timeFrom = Math.floor((now - 150_000) / 1000);
    const timeTo = Math.floor(now / 1000);

    for (const address of addresses) {
      try {
        const res = await fetch(
          `https://public-api.birdeye.so/defi/ohlcv?address=${address}&type=1m&time_from=${timeFrom}&time_to=${timeTo}&currency=usd`,
          { headers: BIRDEYE_HEADERS }
        );
        if (!res.ok) continue;
        const data = await res.json();
        const items: any[] = data?.data?.items ?? [];
        if (items.length === 0) continue;

        const hist = priceHistoryRef.current[address] ?? [];
        items.forEach((candle) => {
          const ts = candle.unixTime * 1000;
          if (!hist.find((h) => Math.abs(h.ts - ts) < 5_000)) {
            hist.push({ price: candle.c, ts });
          }
        });
        priceHistoryRef.current[address] = hist.filter(
          (h) => now - h.ts <= 90_000
        );
      } catch {
        // brand-new tokens may have no OHLCV yet
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }, []);

  const fetchList = useCallback(async () => {
    try {
      let sorted: PumpToken[] = [];

      // Try Moralis first; fall back to DexScreener if it fails
      try {
        sorted = await fetchPumpFunTokensMoralis();
      } catch {
        sorted = await fetchPumpFunTokensDexScreener();
      }

      if (sorted.length === 0 && tokenCacheRef.current.length > 0) {
        sorted = tokenCacheRef.current;
      }

      tokenCacheRef.current = sorted;
      const top = sorted.slice(0, limit);
      topTokensRef.current = top;

      // Seed Birdeye OHLCV history fire-and-forget
      void seedOhlcvHistory(top.map((t) => t.tokenAddress));

      setTokens((prev) => {
        const prevMap = new Map(prev.map((t) => [t.tokenAddress, t]));
        return top.map((t) => ({
          ...t,
          priceChange1m: prevMap.get(t.tokenAddress)?.priceChange1m ?? null,
        }));
      });
      setError(null);
    } catch (err) {
      // If completely failed but we have cache, silently use it
      if (tokenCacheRef.current.length > 0) {
        const top = tokenCacheRef.current.slice(0, limit);
        topTokensRef.current = top;
        setTokens((prev) => {
          const prevMap = new Map(prev.map((t) => [t.tokenAddress, t]));
          return top.map((t) => ({
            ...t,
            priceChange1m: prevMap.get(t.tokenAddress)?.priceChange1m ?? null,
          }));
        });
      } else {
        setError(err instanceof Error ? err.message : "Failed to fetch tokens");
      }
    } finally {
      setLoading(false);
    }
  }, [limit, seedOhlcvHistory]);

  // Single Birdeye multi_price request every 5 seconds for all top tokens
  const fetchPrices = useCallback(async () => {
    const current = topTokensRef.current;
    if (current.length === 0) return;

    const now = Date.now();
    const addresses = current.map((t) => t.tokenAddress).join(",");

    try {
      const res = await fetch(
        `https://public-api.birdeye.so/defi/multi_price?list_address=${addresses}`,
        { headers: BIRDEYE_HEADERS }
      );
      if (!res.ok) return;
      const data = await res.json();
      const priceMap: Record<string, { value: number }> = data?.data ?? {};

      setTokens((prev) =>
        prev.map((token) => {
          const priceData = priceMap[token.tokenAddress];
          if (!priceData || priceData.value <= 0) return token;

          const price = priceData.value;
          const hist = priceHistoryRef.current[token.tokenAddress] ?? [];
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
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchList();

    const listInterval = setInterval(fetchList, 60_000);  // 60s to conserve CU
    const priceInterval = setInterval(fetchPrices, 5_000); // 5s via Birdeye

    return () => {
      clearInterval(listInterval);
      clearInterval(priceInterval);
    };
  }, [fetchList, fetchPrices]);

  return { tokens, loading, error };
}
