import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MORALIS_API_KEY = process.env.MORALIS_API_KEY;
const MIN_MCAP = 10_000;
const CACHE_TTL = 4 * 60 * 1000; // 4 minutes

interface TrendingToken {
  tokenAddress: string;
  name: string;
  symbol: string;
  logo?: string;
  marketCap?: number;
  priceChange24h?: number | null;
  priceUsd?: number;
  volume24h?: number;
  url?: string;
  source: 'moralis' | 'dexscreener';
}

let cachedTokens: TrendingToken[] = [];
let lastFetchTime = 0;

async function fetchMoralis(): Promise<TrendingToken[]> {
  if (!MORALIS_API_KEY) {
    console.warn('MORALIS_API_KEY not set, skipping Moralis fetch');
    return [];
  }

  try {
    const endpoints = [
      'https://solana-gateway.moralis.io/token/mainnet/trendings',
      'https://solana-gateway.moralis.io/token/mainnet/trending',
    ];

    let res: Response | null = null;
    let lastError: Error | null = null;

    for (const endpoint of endpoints) {
      try {
        res = await fetch(endpoint, {
          headers: {
            accept: 'application/json',
            'X-API-Key': MORALIS_API_KEY,
          },
        });
        if (res.ok) break;
      } catch (e) {
        lastError = e as Error;
      }
    }

    if (!res || !res.ok) {
      const body = await res?.json().catch(() => ({}));
      throw new Error(
        `Moralis HTTP ${res?.status ?? 0}: ${(body as any)?.message ?? lastError?.message ?? 'Unknown error'}`
      );
    }

    const json = await res.json();
    const items: any[] = json?.tokens ?? json?.data ?? [];

    return items
      .filter((item) => (item.marketCap ?? 0) >= MIN_MCAP)
      .slice(0, 20)
      .map((item) => ({
        tokenAddress: item.address || item.tokenAddress || '',
        name: item.name || 'Unknown',
        symbol: item.symbol || '???',
        logo: item.logo,
        marketCap: item.marketCap ?? 0,
        priceUsd: item.priceUsd ?? 0,
        priceChange24h: item.priceChange24h ?? null,
        volume24h: item.volume24h ?? 0,
        url: `https://moralis.io/token/${item.address}?chain=solana`,
        source: 'moralis' as const,
      }));
  } catch (err) {
    console.warn('Moralis fetch failed:', err);
    return [];
  }
}

async function fetchDexScreener(): Promise<TrendingToken[]> {
  try {
    const boostRes = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
    if (!boostRes.ok) throw new Error(`DexScreener boosts HTTP ${boostRes.status}`);

    const boosts: any[] = await boostRes.json();
    const addrs = boosts
      .filter((b) => b.chainId === 'solana')
      .slice(0, 50)
      .map((b) => b.tokenAddress)
      .join(',');

    if (!addrs) return [];

    const pairsRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addrs}`);
    if (!pairsRes.ok) throw new Error(`DexScreener pairs HTTP ${pairsRes.status}`);

    const pairsJson = await pairsRes.json();
    const pairs: any[] = pairsJson.pairs ?? [];

    // Keep highest-liquidity pair per base token
    const byAddr = new Map<string, any>();
    for (const p of pairs) {
      if (p.chainId !== 'solana') continue;
      const a = p.baseToken?.address ?? '';
      if (!a) continue;
      const cur = byAddr.get(a);
      if (!cur || (p.liquidity?.usd ?? 0) > (cur.liquidity?.usd ?? 0)) byAddr.set(a, p);
    }

    return Array.from(byAddr.values())
      .filter((p) => (p.marketCap ?? 0) >= MIN_MCAP)
      .slice(0, 20)
      .map((p) => ({
        tokenAddress: p.baseToken?.address ?? '',
        name: p.baseToken?.name || 'Unknown',
        symbol: p.baseToken?.symbol || '???',
        logo: p.info?.imageUrl,
        marketCap: p.marketCap ?? p.fdv ?? 0,
        priceUsd: parseFloat(p.priceUsd ?? '0'),
        priceChange24h: p.priceChange?.h24 ?? null,
        volume24h: (p.volume?.h24 ?? 0) as number,
        url: `https://dexscreener.com/solana/${p.baseToken?.address}`,
        source: 'dexscreener' as const,
      }));
  } catch (err) {
    console.warn('DexScreener fetch failed:', err);
    return [];
  }
}

async function fetchTrendingTokens(): Promise<TrendingToken[]> {
  const now = Date.now();

  // Return cached data if still fresh
  if (cachedTokens.length > 0 && now - lastFetchTime < CACHE_TTL) {
    console.log('Returning cached trending tokens');
    return cachedTokens;
  }

  console.log('Fetching fresh trending tokens from Moralis and DexScreener');

  // Fetch both in parallel
  const [moralisTokens, dexscreenerTokens] = await Promise.all([fetchMoralis(), fetchDexScreener()]);

  // Mix: if Moralis has tokens, use top 10 from each; otherwise use top 20 from DexScreener
  let mixed: TrendingToken[] = [];
  if (moralisTokens.length > 0) {
    mixed = [...moralisTokens.slice(0, 10), ...dexscreenerTokens.slice(0, 10)];
    console.log(
      `Mixing Moralis (${moralisTokens.length}) and DexScreener (${dexscreenerTokens.length}) tokens`
    );
  } else {
    mixed = dexscreenerTokens.slice(0, 20);
    console.log(`Moralis unavailable, using DexScreener tokens only (${dexscreenerTokens.length})`);
  }

  // Deduplicate by tokenAddress (keep first occurrence)
  const seen = new Set<string>();
  const deduped = mixed.filter((token) => {
    if (seen.has(token.tokenAddress)) return false;
    seen.add(token.tokenAddress);
    return true;
  });

  cachedTokens = deduped;
  lastFetchTime = now;

  console.log(`Trending tokens fetched and cached (count: ${cachedTokens.length})`);
  return cachedTokens;
}

export async function GET() {
  try {
    const tokens = await fetchTrendingTokens();
    return NextResponse.json({
      tokens,
      count: tokens.length,
      cached: Date.now() - lastFetchTime < CACHE_TTL,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Failed to fetch trending tokens:', err);
    return NextResponse.json({ error: message, tokens: cachedTokens || [] }, { status: 200 });
  }
}
