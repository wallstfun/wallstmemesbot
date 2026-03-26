import { Router, type Request, type Response } from "express";

const router = Router();

const HELIUS_API_KEY_1 = "54385120-28ac-4baa-9774-3f7ba8ccd656";
const HELIUS_API_KEY_2 = "8ffc1afb-b4e5-494e-852e-f80ec0f5033e";
const HELIUS_V0_URL = "https://api-mainnet.helius-rpc.com/v0";

interface RateLimitState {
  bothKeysFailing: boolean;
  lastFailureTime: number;
  consecutiveFailures: number;
}

const rateLimitStates = new Map<string, RateLimitState>();
let currentKeyIndex = 0;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getNextKey = (): string => {
  const key = currentKeyIndex === 0 ? HELIUS_API_KEY_1 : HELIUS_API_KEY_2;
  currentKeyIndex = (currentKeyIndex + 1) % 2;
  return key;
};

const getAlternateKey = (currentKey: string): string => {
  return currentKey === HELIUS_API_KEY_1 ? HELIUS_API_KEY_2 : HELIUS_API_KEY_1;
};

router.post("/helius-transactions", async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    const cacheKey = `helius-${walletAddress}`;
    const rateLimitState = rateLimitStates.get(cacheKey) || {
      bothKeysFailing: false,
      lastFailureTime: 0,
      consecutiveFailures: 0,
    };

    // If both keys failed, check if we need to continue waiting
    if (rateLimitState.bothKeysFailing) {
      const timeSinceLastFailure = Date.now() - rateLimitState.lastFailureTime;
      const waitTime = 30000; // 30 seconds

      if (timeSinceLastFailure < waitTime) {
        const remainingSeconds = Math.ceil((waitTime - timeSinceLastFailure) / 1000);
        res.status(429).json({
          error: "Rate limit hit on both API keys",
          retryAfter: remainingSeconds,
          message: `Both keys rate-limited. Try again in ${remainingSeconds}s`,
        });
        return;
      } else {
        // Reset after 30 seconds
        rateLimitState.bothKeysFailing = false;
        rateLimitState.consecutiveFailures = 0;
      }
    }

    // Try primary key first (round-robin)
    let primaryKey = getNextKey();
    let url = `${HELIUS_V0_URL}/addresses/${walletAddress}/transactions/?api-key=${primaryKey}&limit=100&type=SWAP`;
    
    let response = await fetch(url);

    // If primary key gets 429, try alternate key with a delay
    if (response.status === 429) {
      await delay(200 + Math.random() * 200); // 200-400ms delay
      
      const alternateKey = getAlternateKey(primaryKey);
      url = `${HELIUS_V0_URL}/addresses/${walletAddress}/transactions/?api-key=${alternateKey}&limit=100&type=SWAP`;
      response = await fetch(url);

      // If both keys failed, mark both as failing
      if (response.status === 429) {
        rateLimitState.bothKeysFailing = true;
        rateLimitState.lastFailureTime = Date.now();
        rateLimitState.consecutiveFailures += 1;
        rateLimitStates.set(cacheKey, rateLimitState);

        res.status(429).json({
          error: "Rate limit hit on both API keys",
          retryAfter: 30,
          message: "Both keys rate-limited. Try again in 30 seconds",
        });
        return;
      }
    }

    // Reset rate limit state on success
    if (response.ok) {
      rateLimitState.bothKeysFailing = false;
      rateLimitState.consecutiveFailures = 0;
    }

    if (!response.ok) {
      throw new Error(`Helius API returned status ${response.status}`);
    }

    const data = await response.json();
    rateLimitStates.set(cacheKey, rateLimitState);
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
