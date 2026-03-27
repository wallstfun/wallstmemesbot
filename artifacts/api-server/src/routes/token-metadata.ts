import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const router = Router();

// In-memory cache for token metadata
const metadataCache = new Map<string, any>();

async function fetchTokenMetadata(mint: string): Promise<any> {
  // Check cache first
  if (metadataCache.has(mint)) {
    logger.debug(`[metadata] Cache hit for ${mint}`);
    return metadataCache.get(mint);
  }

  // Special case: SOL token
  if (mint === "So11111111111111111111111111111111111111112") {
    const solMetadata = {
      symbol: "SOL",
      name: "Solana",
      logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    };
    metadataCache.set(mint, solMetadata);
    return solMetadata;
  }

  let metadata: any = {
    symbol: mint.slice(0, 6).toUpperCase(),
    name: "Unknown Token",
    logoURI: undefined,
  };

  // Method 1: Try Pump.fun (fastest for new tokens)
  try {
    logger.debug(`[metadata] Fetching from Pump.fun for ${mint}`);
    const res = await fetch(`https://frontend-api-v3.pump.fun/coins/${mint}?sync=true`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && (data.symbol || data.name)) {
        metadata = {
          symbol: data.symbol || metadata.symbol,
          name: data.name || metadata.name,
          logoURI: data.image_uri || data.icon || undefined,
        };
        logger.info(`[metadata] Pump.fun success for ${mint}: symbol=${metadata.symbol}`);
        metadataCache.set(mint, metadata);
        return metadata;
      }
    }
  } catch (e) {
    logger.debug(`[metadata] Pump.fun fetch failed for ${mint}`);
  }

  // Method 2: Try Birdeye (fast indexer for Pump.fun)
  try {
    logger.debug(`[metadata] Fetching from Birdeye for ${mint}`);
    const res = await fetch(
      `https://public-api.birdeye.so/defi/v3/token/meta-data/single?address=${mint}&chain=solana`,
      {
        headers: {
          "x-chain": "solana",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (res.ok) {
      const { data } = await res.json();
      if (data && (data.symbol || data.name)) {
        metadata = {
          symbol: data.symbol || metadata.symbol,
          name: data.name || metadata.name,
          logoURI: data.logoURI || data.image || undefined,
        };
        logger.info(`[metadata] Birdeye success for ${mint}: symbol=${metadata.symbol}`);
        metadataCache.set(mint, metadata);
        return metadata;
      }
    }
  } catch (e) {
    logger.debug(`[metadata] Birdeye fetch failed for ${mint}`);
  }

  // Method 3: Try Jupiter single token endpoint
  try {
    logger.debug(`[metadata] Fetching from Jupiter for ${mint}`);
    const res = await fetch(`https://tokens.jup.ag/token/${mint}`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      if (data && (data.symbol || data.name)) {
        metadata = {
          symbol: data.symbol || metadata.symbol,
          name: data.name || metadata.name,
          logoURI: data.logoURI || data.icon || undefined,
        };
        logger.info(`[metadata] Jupiter success for ${mint}: symbol=${metadata.symbol}`);
        metadataCache.set(mint, metadata);
        return metadata;
      }
    }
  } catch (e) {
    logger.debug(`[metadata] Jupiter fetch failed for ${mint}`);
  }

  // Fallback: cache and return
  logger.info(`[metadata] Final fallback for ${mint}: symbol=${metadata.symbol}`);
  metadataCache.set(mint, metadata);
  return metadata;
}

router.post("/token-metadata", async (req: Request, res: Response) => {
  try {
    const { mints } = req.body;
    if (!Array.isArray(mints) || mints.length === 0) {
      return res.status(400).json({ error: "mints array required" });
    }

    const metadata: Record<string, any> = {};
    for (const mint of mints) {
      if (mint) {
        metadata[mint] = await fetchTokenMetadata(mint);
      }
    }

    res.json({ data: metadata });
  } catch (error) {
    logger.error("[token-metadata] Error:", error);
    res.status(500).json({ error: "Failed to fetch metadata" });
  }
});

export default router;
