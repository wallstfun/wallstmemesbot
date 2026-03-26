import { Router, type Request, type Response } from "express";

const router = Router();

const HELIUS_API_KEY = "54385120-20ac-4baa-9774-3f7ba8ccd656";
const HELIUS_V0_URL = "https://api-mainnet.helius-rpc.com/v0";

interface RateLimitState {
  retryCount: number;
  nextRetryTime: number;
}

const rateLimitStates = new Map<string, RateLimitState>();

const getBackoffDelay = (retryCount: number): number => {
  if (retryCount === 0) return 10000; // 10s
  if (retryCount === 1) return 20000; // 20s
  if (retryCount === 2) return 30000; // 30s
  return 30000; // max 30s
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

router.post("/helius-transactions", async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    const cacheKey = `helius-${walletAddress}`;
    const rateLimitState = rateLimitStates.get(cacheKey) || { retryCount: 0, nextRetryTime: 0 };

    // Check if we need to wait due to rate limiting
    if (rateLimitState.nextRetryTime > Date.now()) {
      const waitTime = Math.ceil((rateLimitState.nextRetryTime - Date.now()) / 1000);
      res.status(429).json({
        error: "Rate limited by Helius API",
        retryAfter: waitTime,
        message: `Please retry after ${waitTime} seconds`,
      });
      return;
    }

    // Make the actual request to Helius Enhanced Transaction API
    const url = `${HELIUS_V0_URL}/addresses/${walletAddress}/transactions/?api-key=${HELIUS_API_KEY}&limit=100&type=SWAP`;

    const response = await fetch(url);

    // Handle rate limiting (429)
    if (response.status === 429) {
      const newRetryCount = rateLimitState.retryCount + 1;
      const backoffDelay = getBackoffDelay(newRetryCount);
      const nextRetryTime = Date.now() + backoffDelay;

      rateLimitStates.set(cacheKey, {
        retryCount: newRetryCount,
        nextRetryTime,
      });

      const waitTime = Math.ceil(backoffDelay / 1000);
      res.status(429).json({
        error: "Rate limited by Helius API",
        retryAfter: waitTime,
        message: `Please retry after ${waitTime} seconds`,
      });
      return;
    }

    // Reset rate limit state on success
    if (response.ok) {
      rateLimitStates.delete(cacheKey);
    }

    if (!response.ok) {
      throw new Error(`Helius API returned status ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Helius proxy error:", errorMessage);
    res.status(500).json({
      error: "Failed to fetch transactions from Helius",
      message: errorMessage,
    });
  }
});

export default router;
