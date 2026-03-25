import { NextResponse } from 'next/server';

let cachedData: any = null;
let cacheTime = 0;
const CACHE_DURATION = 4 * 60 * 1000; // 4 minutes

export async function GET() {
  const now = Date.now();
  
  if (cachedData && now - cacheTime < CACHE_DURATION) {
    return NextResponse.json(cachedData);
  }

  try {
    // Your Moralis + DexScreener logic here (copy from artifacts/api-server/src/routes/tokens.ts)
    // For now, a minimal working version:
    const moralisKey = process.env.MORALIS_API_KEY;
    // ... (paste the full logic from the artifacts file here)

    // Example placeholder until you copy the real code:
    const tokens = []; // replace with real fetch

    cachedData = { tokens, count: tokens.length };
    cacheTime = now;

    return NextResponse.json(cachedData);
  } catch (error) {
    console.error('Trending tokens error:', error);
    return NextResponse.json({ tokens: [], error: 'Failed to fetch' }, { status: 200 });
  }
}
