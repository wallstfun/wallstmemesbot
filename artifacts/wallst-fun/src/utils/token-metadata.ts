// Fast token metadata lookup using Dex Screener + static list

export const metadataCache = new Map<string, any>();
export const priceCache = new Map<string, number>();

export interface TokenMetadata {
  symbol: string;
  name: string;
  logoURI?: string;
}

// Hardcoded common tokens for instant lookup (Dex Screener image URLs)
const COMMON_TOKENS: Record<string, TokenMetadata> = {
  "So11111111111111111111111111111111111111112": {
    symbol: "SOL",
    name: "Solana",
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  },
  "EPjFWdd5Au17hunznKT2KNeiljipl5B4d4FWkuNvpj97": {
    symbol: "USDC",
    name: "USD Coin",
    logoURI: "https://dd.dexscreener.com/ds-data/tokens/solana/EPjFWdd5Au17hunznKT2KNeiljipl5B4d4FWkuNvpj97.png",
  },
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenErt9": {
    symbol: "USDT",
    name: "Tether USD",
    logoURI: "https://dd.dexscreener.com/ds-data/tokens/solana/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenErt9.png",
  },
  "4fSWEw2wbYEUCcMtitzmeGUfqinoafXxkhqZrA9Gpump": {
    symbol: "PIGEON",
    name: "level941",
    logoURI: "https://dd.dexscreener.com/ds-data/tokens/solana/4fSWEw2wbYEUCcMtitzmeGUfqinoafXxkhqZrA9Gpump.png",
  },
  "8Jx8AAHj86wbQgUTjGuj6GTTL5Ps3cqxKRTvpaJApump": {
    symbol: "PENGUIN",
    name: "Nietzschean Penguin",
    logoURI: "https://dd.dexscreener.com/ds-data/tokens/solana/8Jx8AAHj86wbQgUTjGuj6GTTL5Ps3cqxKRTvpaJApump.png",
  },
  "2RheNTdvps3kM2Gdu45jKH2oTH3a6gnYLK6GwwNXymv9": {
    symbol: "2RHENT",
    name: "Unknown Token",
    logoURI: "https://dd.dexscreener.com/ds-data/tokens/solana/2RheNTdvps3kM2Gdu45jKH2oTH3a6gnYLK6GwwNXymv9.png",
  },
};

/**
 * Fast metadata fetch using Dex Screener (best for pump.fun tokens)
 * Falls back to static list for common tokens
 */
export async function fetchTokenMetadata(mint: string): Promise<TokenMetadata> {
  // Check cache first
  if (metadataCache.has(mint)) {
    return metadataCache.get(mint);
  }

  // Check hardcoded list for instant lookup
  if (COMMON_TOKENS[mint]) {
    console.log(`[metadata] Found ${mint} in common tokens list`);
    metadataCache.set(mint, COMMON_TOKENS[mint]);
    return COMMON_TOKENS[mint];
  }

  let metadata: TokenMetadata = {
    symbol: mint.slice(0, 6).toUpperCase(),
    name: "Unknown Token",
    logoURI: undefined,
  };

  // Try Dex Screener (fastest, has pump.fun tokens)
  try {
    console.log(`[metadata] Fetching from Dex Screener for ${mint}`);
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.pairs && data.pairs.length > 0) {
        const pair = data.pairs[0];
        if (pair.baseToken) {
          metadata = {
            symbol: pair.baseToken.symbol || metadata.symbol,
            name: pair.baseToken.name || metadata.name,
            logoURI: pair.info?.imageUrl || undefined,
          };
          console.log(`[metadata] Dex Screener found: ${metadata.symbol} - ${metadata.name}`);
          metadataCache.set(mint, metadata);
          return metadata;
        }
      }
    }
  } catch (e) {
    console.log(`[metadata] Dex Screener failed for ${mint}:`, e instanceof Error ? e.message : "timeout");
  }

  // Cache and return fallback
  metadataCache.set(mint, metadata);
  return metadata;
}

/**
 * Fetch prices from Jupiter with CoinGecko fallback
 */
export async function fetchTokenPrices(mints: string[]): Promise<Record<string, number>> {
  if (mints.length === 0) return {};

  const prices: Record<string, number> = {};
  const uncachedMints = mints.filter(m => !priceCache.has(m));

  // Return cached prices
  mints.forEach(mint => {
    if (priceCache.has(mint)) {
      prices[mint] = priceCache.get(mint)!;
    }
  });

  if (uncachedMints.length === 0) {
    console.log(`[price] All ${mints.length} prices cached`);
    return prices;
  }

  // Fetch uncached prices from Jupiter
  try {
    console.log(`[price] Fetching ${uncachedMints.length} uncached token prices from Jupiter...`);
    const res = await fetch(`https://price.jup.ag/v6/price?ids=${uncachedMints.join(",")}`, {
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.data) {
        Object.entries(data.data).forEach(([mint, info]: [string, any]) => {
          const price = parseFloat(info.price ?? "0");
          if (price > 0) {
            prices[mint] = price;
            priceCache.set(mint, price);
            console.log(`[price] ${mint}: $${price.toFixed(6)}`);
          }
        });
      }
      return prices;
    }
  } catch (e) {
    console.log(`[price] Jupiter fetch failed:`, e instanceof Error ? e.message : String(e));
  }

  // Fallback: Try CoinGecko for remaining mints
  const remainingMints = uncachedMints.filter(m => !prices[m]);
  if (remainingMints.length > 0) {
    console.log(`[price] Fallback: Attempting CoinGecko for ${remainingMints.length} tokens`);
    for (const mint of remainingMints) {
      try {
        const res = await fetch(`https://api.coingecko.com/api/v3/coins/solana/contract/${mint}`, {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.market_data?.current_price?.usd) {
            const price = data.market_data.current_price.usd;
            prices[mint] = price;
            priceCache.set(mint, price);
            console.log(`[price] CoinGecko ${mint}: $${price.toFixed(6)}`);
          }
        }
      } catch {}
    }
  }

  return prices;
}
