// Shared token metadata and price caching utilities

// In-memory metadata cache (session-level)
export const metadataCache = new Map<string, any>();

// In-memory price cache (session-level)
export const priceCache = new Map<string, number>();

export interface TokenMetadata {
  symbol: string;
  name: string;
  logoURI?: string;
}

/**
 * Fetch token metadata with multiple fallbacks (Jupiter → CoinGecko → Smart URLs)
 */
export async function fetchTokenMetadata(mint: string): Promise<TokenMetadata> {
  // Check cache first
  if (metadataCache.has(mint)) {
    console.log(`[metadata] Cache hit for ${mint}`);
    return metadataCache.get(mint);
  }

  // Special case: SOL token
  if (mint === "So11111111111111111111111111111111111111112") {
    const solMetadata: TokenMetadata = {
      symbol: "SOL",
      name: "Solana",
      logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    };
    metadataCache.set(mint, solMetadata);
    console.log(`[metadata] SOL token resolved with logo`);
    return solMetadata;
  }

  let metadata: TokenMetadata = {
    symbol: mint.slice(0, 6).toUpperCase(),
    name: "Unknown Token",
    logoURI: undefined,
  };

  // Method 1: Try Jupiter single token endpoint
  try {
    console.log(`[metadata] Fetching from Jupiter /token/{mint} for ${mint}`);
    const res = await fetch(`https://tokens.jup.ag/token/${mint}`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      if (data.symbol || data.name || data.logoURI || data.icon) {
        metadata = {
          symbol: data.symbol || metadata.symbol,
          name: data.name || metadata.name,
          logoURI: data.logoURI || data.icon || undefined,
        };
        console.log(`[metadata] Jupiter success for ${mint}: symbol=${metadata.symbol}, name=${metadata.name}`);
        metadataCache.set(mint, metadata);
        return metadata;
      }
    }
  } catch (e) {
    console.log(`[metadata] Jupiter fetch failed for ${mint}:`, e instanceof Error ? e.message : String(e));
  }

  // Method 2: Try Jupiter full tokens list (for newer/meme tokens)
  try {
    console.log(`[metadata] Fetching from Jupiter tokens list for ${mint}`);
    const res = await fetch("https://tokens.jup.ag/tokens", { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const tokens = await res.json();
      const tokenData = Array.isArray(tokens) ? tokens.find((t: any) => t.address === mint || t.mint === mint) : tokens[mint];
      if (tokenData && (tokenData.symbol || tokenData.name || tokenData.logoURI || tokenData.icon)) {
        metadata = {
          symbol: tokenData.symbol || metadata.symbol,
          name: tokenData.name || metadata.name,
          logoURI: tokenData.logoURI || tokenData.icon || undefined,
        };
        console.log(`[metadata] Jupiter list success for ${mint}: symbol=${metadata.symbol}, name=${metadata.name}`);
        metadataCache.set(mint, metadata);
        return metadata;
      }
    }
  } catch (e) {
    console.log(`[metadata] Jupiter list fetch failed for ${mint}:`, e instanceof Error ? e.message : String(e));
  }

  // Method 3: Try CoinGecko for newer tokens
  try {
    console.log(`[metadata] Fetching from CoinGecko for ${mint}`);
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/solana/contract/${mint}`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      if (data.symbol || data.name || data.image?.large || data.image?.small) {
        metadata = {
          symbol: data.symbol?.toUpperCase() || metadata.symbol,
          name: data.name || metadata.name,
          logoURI: data.image?.large || data.image?.small || undefined,
        };
        console.log(`[metadata] CoinGecko success for ${mint}: symbol=${metadata.symbol}, name=${metadata.name}`);
        metadataCache.set(mint, metadata);
        return metadata;
      }
    }
  } catch (e) {
    console.log(`[metadata] CoinGecko fetch failed for ${mint}:`, e instanceof Error ? e.message : String(e));
  }

  // Method 4: Try Orca API (more reliable for Solana tokens)
  try {
    console.log(`[metadata] Fetching from Orca API for ${mint}`);
    const res = await fetch(`https://api.orca.so/v1/token?address=${mint}`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      if (data && (data.symbol || data.name || data.logoURI)) {
        metadata = {
          symbol: data.symbol?.toUpperCase() || metadata.symbol,
          name: data.name || metadata.name,
          logoURI: data.logoURI || undefined,
        };
        if (metadata.logoURI) {
          console.log(`[metadata] Orca API success for ${mint}: symbol=${metadata.symbol}, name=${metadata.name}`);
          metadataCache.set(mint, metadata);
          return metadata;
        }
      }
    }
  } catch (e) {
    console.log(`[metadata] Orca API fetch failed for ${mint}:`, e instanceof Error ? e.message : String(e));
  }

  // Method 5: Try Metaplex API
  try {
    console.log(`[metadata] Fetching from Metaplex for ${mint}`);
    const res = await fetch(`https://api.metaplex.solana.com/tokens/${mint}`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      if (data && (data.symbol || data.name || data.image)) {
        metadata = {
          symbol: data.symbol?.toUpperCase() || metadata.symbol,
          name: data.name || metadata.name,
          logoURI: data.image || undefined,
        };
        if (metadata.logoURI) {
          console.log(`[metadata] Metaplex success for ${mint}: symbol=${metadata.symbol}, name=${metadata.name}`);
          metadataCache.set(mint, metadata);
          return metadata;
        }
      }
    }
  } catch (e) {
    console.log(`[metadata] Metaplex fetch failed for ${mint}:`, e instanceof Error ? e.message : String(e));
  }

  // Method 6: Smart fallback - try common image URLs
  try {
    console.log(`[metadata] Trying smart fallback URLs for ${mint}`);
    const fallbackUrls = [
      `https://arweave.net/images/${mint}.png`,
      `https://bafybeiclsp2jcvqr5zihfvvhgfz5ijfzhdp7nstcb52q2vpj5bz5ybmea.ipfs.nftstorage.link/${mint}.png`,
      `https://metadata.solanium.io/images/${mint}.png`,
      `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${mint}/logo.png`,
    ];
    
    for (const url of fallbackUrls) {
      try {
        const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          metadata.logoURI = url;
          console.log(`[metadata] Smart fallback found image at ${url} for ${mint}`);
          metadataCache.set(mint, metadata);
          return metadata;
        }
      } catch {}
    }
  } catch (e) {
    console.log(`[metadata] Smart fallback failed for ${mint}:`, e instanceof Error ? e.message : String(e));
  }

  console.log(`[metadata] Final fallback for ${mint}: resolved to symbol=${metadata.symbol}`);
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
      signal: AbortSignal.timeout(8000) 
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
          } else {
            console.log(`[price] ${mint}: No price data`);
          }
        });
      }
      return prices;
    } else {
      console.log(`[price] Jupiter API returned ${res.status}, using fallback`);
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
          signal: AbortSignal.timeout(3000)
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
