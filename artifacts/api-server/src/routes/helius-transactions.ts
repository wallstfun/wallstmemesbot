import { Router, type Request, type Response } from "express";

const router = Router();

const KEY1 = "54385120-28ac-4baa-9774-3f7ba8ccd656";
const KEY2 = "8ffc1afb-b4e5-494e-852e-f80ec0f5033e";
const HELIUS_V0_URL = "https://api-mainnet.helius-rpc.com/v0";

let currentKeyIndex = 0;
const rateLimitStates = new Map<string, { pausedUntil: number }>();

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

router.post("/helius-transactions", async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    const cacheKey = `helius-${walletAddress}`;
    const rateLimitState = rateLimitStates.get(cacheKey) || { pausedUntil: 0 };

    // Check if wallet is paused due to rate limiting both keys
    if (rateLimitState.pausedUntil > Date.now()) {
      const remainingSeconds = Math.ceil((rateLimitState.pausedUntil - Date.now()) / 1000);
      res.status(429).json({
        error: "Rate limit hit on both API keys",
        retryAfter: remainingSeconds,
        message: `Both keys rate-limited. Try again in ${remainingSeconds}s`,
      });
      return;
    }

    // Try both keys with fallback
    const keys = [KEY1, KEY2];
    let lastError: any = null;
    let lastStatus = 0;

    for (let attempt = 0; attempt < 2; attempt++) {
      const key = keys[currentKeyIndex];
      currentKeyIndex = (currentKeyIndex + 1) % 2; // round-robin

      const url = `${HELIUS_V0_URL}/addresses/${walletAddress}/transactions?api-key=${key}&type=SWAP&limit=50`;

      try {
        const response = await fetch(url, { method: "GET" });
        lastStatus = response.status;

        if (response.ok) {
          // Success - clear any paused state
          rateLimitStates.delete(cacheKey);
          const data = await response.json();
          res.json(data);
          return;
        }

        if (response.status !== 429) {
          // Non-rate-limit error - break out and return error
          lastError = `HTTP ${response.status}`;
          break;
        }

        // 429 on this key - try the other one
        console.warn(`Key ${attempt + 1} rate-limited (429). Trying alternate key...`);
        await delay(300); // Small delay before trying alternate key
      } catch (fetchErr) {
        lastError = fetchErr instanceof Error ? fetchErr.message : "Fetch error";
        break;
      }
    }

    // If we got here, both keys failed with 429 or we hit a non-429 error
    if (lastStatus === 429) {
      // Both keys rate-limited - pause for 60 seconds
      const pauseUntil = Date.now() + 60000;
      rateLimitStates.set(cacheKey, { pausedUntil: pauseUntil });

      res.status(429).json({
        error: "Rate limit hit on both API keys",
        retryAfter: 60,
        message: "Both keys rate-limited. Try again in 60 seconds",
      });
      return;
    }

    // Some other error occurred
    res.status(lastStatus || 500).json({
      error: "Failed to fetch from Helius",
      message: lastError,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Helius proxy error:", errorMessage);
    res.status(500).json({
      error: "Server error",
      message: errorMessage,
    });
  }
});

export default router;
