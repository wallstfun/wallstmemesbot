import { Router, type Request, type Response } from "express";

const router = Router();

const KEY_PRIMARY = "8ffc1afb-b4e5-494e-852e-f80ec0f5033e";
const KEY_FALLBACK = "54385120-28ac-4baa-9774-3f7ba8ccd656";
const HELIUS_V0_URL = "https://api-mainnet.helius-rpc.com/v0";
const JUPITER_SWAP_HISTORY_URL = "https://api.jup.ag/swap/v1/swap-history";
const JUPITER_API_KEY = "429e13f2-25f8-4706-9326-24287fa313d4";

const rateLimitStates = new Map<string, { pausedUntil: number }>();
const responseCache = new Map<string, { data: any; expiresAt: number }>();
let lastHeliusRequestTime = 0;
let lastJupiterRequestTime = 0;
const MIN_HELIUS_INTERVAL = 2000; // 2s between Helius requests
const MIN_JUPITER_INTERVAL = 1000; // 1000ms = 1 RPS limit for Jupiter

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const throttledHeliusFetch = async (url: string) => {
  const now = Date.now();
  const timeSinceLastRequest = now - lastHeliusRequestTime;
  if (timeSinceLastRequest < MIN_HELIUS_INTERVAL) {
    await delay(MIN_HELIUS_INTERVAL - timeSinceLastRequest);
  }
  lastHeliusRequestTime = Date.now();
  return fetch(url, { method: "GET" });
};

const throttledJupiterFetch = async (url: string) => {
  const now = Date.now();
  const timeSinceLastRequest = now - lastJupiterRequestTime;
  if (timeSinceLastRequest < MIN_JUPITER_INTERVAL) {
    await delay(MIN_JUPITER_INTERVAL - timeSinceLastRequest);
  }
  lastJupiterRequestTime = Date.now();
  return fetch(url, { method: "GET" });
};

router.post("/helius-transactions", async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    const cacheKey = `tx-${walletAddress}`;
    
    // Check cache
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json(cached.data);
      return;
    }

    // Check rate limit
    const state = rateLimitStates.get(cacheKey);
    if (state && state.pausedUntil > Date.now()) {
      const remaining = Math.ceil((state.pausedUntil - Date.now()) / 1000);
      res.status(429).json({ error: "Rate limited", retryAfter: remaining });
      return;
    }

    // 1. Fetch from Helius (primary)
    let heliusData: any[] = [];
    const keys = [KEY_PRIMARY, KEY_FALLBACK];
    let allRateLimited = true;

    for (const key of keys) {
      const url = `${HELIUS_V0_URL}/addresses/${walletAddress}/transactions?api-key=${key}&limit=100`;
      try {
        const response = await throttledHeliusFetch(url);

        if (response.ok) {
          heliusData = await response.json();
          rateLimitStates.delete(cacheKey);
          allRateLimited = false;
          break;
        }

        if (response.status === 429 || response.status === 401) {
          await delay(300);
          continue;
        }

        allRateLimited = false;
        break;
      } catch (error) {
        allRateLimited = false;
        break;
      }
    }

    if (allRateLimited) {
      const pauseUntil = Date.now() + 180000;
      rateLimitStates.set(cacheKey, { pausedUntil: pauseUntil });
      res.status(429).json({ error: "Both API keys rate-limited", retryAfter: 180 });
      return;
    }

    // 2. Fetch from Jupiter (supplementary, non-blocking, rate-limited to 1 RPS)
    let jupiterData: any[] = [];
    try {
      const jupUrl = `${JUPITER_SWAP_HISTORY_URL}?wallet=${walletAddress}&limit=100`;
      const jupRes = await throttledJupiterFetch(jupUrl);
      if (jupRes.ok) {
        const jupJson = await jupRes.json();
        jupiterData = Array.isArray(jupJson) ? jupJson : (jupJson?.swaps ?? jupJson?.history ?? []);
      }
    } catch (err) {
      // Non-blocking: Jupiter failure doesn't crash response
    }

    // 3. Merge: Helius primary + unique Jupiter txs
    const heliusSigs = new Set(heliusData.map((tx) => tx.signature).filter(Boolean));
    const uniqueJupiterTxs = jupiterData.filter((tx) => !heliusSigs.has(tx.signature));
    const merged = [...heliusData, ...uniqueJupiterTxs];

    // Cache and return merged data
    responseCache.set(cacheKey, { data: merged, expiresAt: Date.now() + 30000 });
    res.json(merged);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Server error", message: msg });
  }
});

export default router;
