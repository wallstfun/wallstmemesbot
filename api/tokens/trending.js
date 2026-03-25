// FORCE VERCEL REBUILD - DexScreener only - 2026-03-25

const MIN_MCAP = 10_000;
const CACHE_TTL = 4 * 60 * 1000; // 4 minutes

let cachedTokens = [];
let lastFetchTime = 0;

async function fetchDexScreener() {
  try {
    const boostRes = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
    if (!boostRes.ok) throw new Error(`DexScreener boosts HTTP ${boostRes.status}`);

    const boosts = await boostRes.json();
    const addrs = boosts
      .filter((b) => b.chainId === 'solana')
      .slice(0, 50)
      .map((b) => b.tokenAddress)
      .join(',');

    if (!addrs) return [];

    const pairsRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addrs}`);
    if (!pairsRes.ok) throw new Error(`DexScreener pairs HTTP ${pairsRes.status}`);

    const pairsJson = await pairsRes.json();
    const pairs = pairsJson.pairs ?? [];

    // Keep highest-liquidity pair per base token
    const byAddr = new Map();
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
        volume24h: (p.volume?.h24 ?? 0),
        url: `https://dexscreener.com/solana/${p.baseToken?.address}`,
        source: 'dexscreener',
      }));
  } catch (err) {
    console.warn('DexScreener fetch failed:', err);
    return [];
  }
}

async function fetchTrendingTokens() {
  const now = Date.now();

  // Return cached data if still fresh
  if (cachedTokens.length > 0 && now - lastFetchTime < CACHE_TTL) {
    console.log('Returning cached trending tokens');
    return cachedTokens;
  }

  console.log('Fetching fresh trending tokens from DexScreener');

  const tokens = await fetchDexScreener();

  cachedTokens = tokens;
  lastFetchTime = now;

  console.log(`Trending tokens fetched and cached (count: ${cachedTokens.length})`);
  return cachedTokens;
}

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const tokens = await fetchTrendingTokens();
    return res.status(200).json({
      tokens,
      count: tokens.length,
      cached: Date.now() - lastFetchTime < CACHE_TTL,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Failed to fetch trending tokens:', err);
    return res.status(200).json({ error: message, tokens: cachedTokens || [] });
  }
};
