import { Router, type Request, type Response } from "express";

const router = Router();

// Key2 is the working key. Key1 returns 401 — kept as last-resort fallback only.
const KEY_PRIMARY = "8ffc1afb-b4e5-494e-852e-f80ec0f5033e";
const KEY_FALLBACK = "54385120-28ac-4baa-9774-3f7ba8ccd656";
const HELIUS_V0_URL = "https://api-mainnet.helius-rpc.com/v0";

// Rate limiting and caching
const rateLimitStates = new Map<string, { pausedUntil: number }>();
const responseCache = new Map<string, { data: any; expiresAt: number }>();
let lastHeliusRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // Never send more than 1 Helius request every 2 seconds

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const throttledFetch = async (url: string) => {
  const now = Date.now();
  const timeSinceLastRequest = now - lastHeliusRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await delay(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
  }
  lastHeliusRequestTime = Date.now();
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
    
    // 1. Check cache first (120s TTL)
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json(cached.data);
      return;
    }

    // 2. Check if paused due to rate limiting
    const state = rateLimitStates.get(cacheKey);
    if (state && state.pausedUntil > Date.now()) {
      const remaining = Math.ceil((state.pausedUntil - Date.now()) / 1000);
      res.status(429).json({
        error: "Rate limited",
        retryAfter: remaining,
        message: `Rate limited. Retry in ${remaining}s`,
      });
      return;
    }

    // 3. Try primary key (Key2), then fallback (Key1) only if primary fails
    const keys = [KEY_PRIMARY, KEY_FALLBACK];
    let allRateLimited = true;

    for (const key of keys) {
      const url = `${HELIUS_V0_URL}/addresses/${walletAddress}/transactions?api-key=${key}&limit=100`;
      try {
        const response = await throttledFetch(url);

        if (response.ok) {
          rateLimitStates.delete(cacheKey);
          const data = await response.json();
          // Cache for 30 seconds (balance freshness vs rate limits)
          responseCache.set(cacheKey, { data, expiresAt: Date.now() + 30000 });
          res.json(data);
          return;
        }

        if (response.status === 429 || response.status === 401) {
          console.warn(`[helius-tx] Key ending ...${key.slice(-6)} returned ${response.status}. Trying next key...`);
          await delay(300);
          continue;
        }

        // Non-retryable error
        allRateLimited = false;
        res.status(response.status).json({ error: `Helius returned ${response.status}` });
        return;
      } catch (fetchErr) {
        allRateLimited = false;
        const msg = fetchErr instanceof Error ? fetchErr.message : "Fetch error";
        console.error("[helius-tx] Fetch error:", msg);
        res.status(500).json({ error: "Fetch failed", message: msg });
        return;
      }
    }

    if (allRateLimited) {
      const pauseUntil = Date.now() + 180000; // 3 minutes backoff (180s)
      rateLimitStates.set(cacheKey, { pausedUntil: pauseUntil });
      res.status(429).json({
        error: "Both API keys rate-limited",
        retryAfter: 180,
        message: "Both keys rate-limited. Retry in 180s",
      });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[helius-tx] Server error:", msg);
    res.status(500).json({ error: "Server error", message: msg });
  }
});

export default router;
