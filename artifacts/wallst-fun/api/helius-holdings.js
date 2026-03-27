const ALCHEMY_URL = "https://solana-mainnet.g.alchemy.com/v2/9vePK8JAvqdzoDs3Q1kZ4";
const DEXSCREENER_URL = "https://api.dexscreener.com/latest/dex/tokens";
const JUPITER_TOKEN_URL = "https://token.jup.ag/all";

// Known token metadata
const KNOWN_TOKENS = {
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": { // USDC
    symbol: "USDC",
    name: "USD Coin",
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
  },
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenEsw": { // USDT
    symbol: "USDT",
    name: "Tether USD",
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenEsw/logo.svg",
  },
  "So11111111111111111111111111111111111111112": { // SOL
    symbol: "SOL",
    name: "Solana",
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  },
  "4fSWEw2wbYEUCcMtitzmeGUfqinoafXxkhqZrA9Gpump": { // PIGEON
    symbol: "PIGEON",
    name: "Pigeon Token",
    logoURI: "",
  },
};

// Returns items in Helius DAS format so the frontend hook can parse correctly
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const { walletAddress } = req.body || {};
  if (!walletAddress) { res.status(400).json({ error: "walletAddress is required" }); return; }

  try {
    // 1. Get token accounts via Alchemy
    const alchemyRes = await fetch(ALCHEMY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "getTokenAccountsByOwner",
        params: [
          walletAddress,
          { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
          { encoding: "jsonParsed" },
        ],
      }),
    });

    if (!alchemyRes.ok) throw new Error("Alchemy failed: " + alchemyRes.status);
    const alchemyData = await alchemyRes.json();
    if (alchemyData.error) throw new Error(alchemyData.error.message);

    const accounts = alchemyData.result?.value ?? [];
    const tokens = accounts
      .map((acc) => {
        const info = acc?.account?.data?.parsed?.info;
        return info ? {
          mint: info.mint,
          rawAmount: Number(info.tokenAmount?.amount ?? 0),
          decimals: info.tokenAmount?.decimals ?? 0,
          uiAmount: info.tokenAmount?.uiAmount ?? 0,
        } : null;
      })
      .filter((t) => t && t.uiAmount > 0);

    if (tokens.length === 0) { res.json({ items: [] }); return; }

    // 2. Fetch metadata from known tokens first, then Jupiter for unknowns
    let metadataMap = {};
    const mints = tokens.map(t => t.mint);
    
    // Pre-populate from KNOWN_TOKENS
    for (const mint of mints) {
      if (KNOWN_TOKENS[mint]) {
        metadataMap[mint] = KNOWN_TOKENS[mint];
      }
    }
    
    // Fetch Jupiter for unknowns only
    const unknownMints = mints.filter(m => !metadataMap[m]);
    if (unknownMints.length > 0) {
      try {
        const jupRes = await fetch(JUPITER_TOKEN_URL);
        if (jupRes.ok) {
          const jupList = await jupRes.json();
          const jupTokenMap = {};
          jupList.forEach((t) => { jupTokenMap[t.address] = t; });
          for (const mint of unknownMints) {
            if (jupTokenMap[mint]) {
              metadataMap[mint] = jupTokenMap[mint];
            }
          }
        }
      } catch { /* non-fatal */ }
    }

    // 3. Fetch prices from DexScreener
    let priceMap = {};
    try {
      const dexRes = await fetch(DEXSCREENER_URL + "/" + mints.join(","));
      if (dexRes.ok) {
        const dexData = await dexRes.json();
        (dexData.pairs ?? []).forEach((pair) => {
          if (pair.baseToken?.address && !priceMap[pair.baseToken.address]) {
            priceMap[pair.baseToken.address] = parseFloat(pair.priceUsd ?? "0");
          }
        });
      }
    } catch { /* non-fatal */ }

    // 4. Build response in Helius DAS format (what the frontend hook expects)
    const items = tokens.map((t) => {
      const meta = metadataMap[t.mint];
      const pricePerToken = priceMap[t.mint] ?? 0;
      const totalPrice = t.uiAmount * pricePerToken;
      const symbol = meta?.symbol ?? t.mint.slice(0, 6).toUpperCase();
      const name = meta?.name ?? "Unknown Token";
      return {
        id: t.mint,
        interface: "FungibleToken",
        token_info: {
          symbol,
          decimals: t.decimals,
          balance: t.rawAmount,
          price_info: pricePerToken > 0 ? {
            price_per_token: pricePerToken,
            total_price: totalPrice,
          } : undefined,
        },
        content: {
          metadata: {
            name,
            symbol,
          },
          links: {
            image: meta?.logoURI,
          },
        },
      };
    });

    res.json({ items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[helius-holdings]", msg);
    res.status(500).json({ error: "Failed to fetch holdings", message: msg });
  }
};
