const ALCHEMY_URL = "https://solana-mainnet.g.alchemy.com/v2/9vePK8JAvqdzoDs3Q1kZ4";
const JUPITER_TOKENS_URL = "https://token.jup.ag/all";
const JUPITER_PRICE_URL = "https://price.jup.ag/v6/price";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const { walletAddress } = req.body || {};
  if (!walletAddress) { res.status(400).json({ error: "walletAddress is required" }); return; }

  try {
    // 1. Get all token accounts from Alchemy
    console.log(`[holdings] Fetching token accounts for ${walletAddress}`);
    const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
    const alchemyRes = await fetch(ALCHEMY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "getTokenAccountsByOwner",
        params: [
          walletAddress,
          { programId: TOKEN_PROGRAM_ID },
          { encoding: "jsonParsed" },
        ],
      }),
    });

    if (!alchemyRes.ok) throw new Error(`Alchemy failed: ${alchemyRes.status}`);
    const alchemyData = await alchemyRes.json();
    if (alchemyData.error) throw new Error(alchemyData.error.message);

    const rawAccounts = alchemyData.result?.value ?? [];
    console.log(`[holdings] Alchemy returned ${rawAccounts.length} token accounts`);

    // Parse and filter tokens (skip native SOL, handle separately)
    const tokens = rawAccounts
      .map((account) => {
        const parsed = account?.account?.data?.parsed;
        if (!parsed || parsed.type !== "account") return null;
        
        const mint = parsed.info?.mint;
        const tokenAmount = parsed.info?.tokenAmount;
        if (!mint || !tokenAmount) return null;
        
        const balance = parseFloat(tokenAmount.amount ?? "0");
        const decimals = tokenAmount.decimals ?? 0;
        const uiAmount = balance / Math.pow(10, decimals);
        
        console.log(`[holdings] Token ${mint?.slice(0, 8)}: balance=${balance}, decimals=${decimals}, uiAmount=${uiAmount}`);
        if (uiAmount <= 0) return null;
        return {
          mint,
          rawAmount: balance,
          decimals,
          uiAmount,
        };
      })
      .filter((t) => t !== null);

    console.log(`[holdings] Found ${tokens.length} SPL tokens with balance > 0`);
    if (tokens.length === 0) { res.json({ items: [] }); return; }

    const mints = tokens.map(t => t.mint);

    // 2. Fetch all token metadata from Jupiter (single call)
    console.log(`[holdings] Fetching metadata from Jupiter for ${mints.length} tokens`);
    let jupTokenMap = {};
    try {
      const jupRes = await fetch(JUPITER_TOKENS_URL);
      if (jupRes.ok) {
        const jupList = await jupRes.json();
        jupList.forEach((t) => { jupTokenMap[t.address] = t; });
        console.log(`[holdings] Jupiter returned ${Object.keys(jupTokenMap).length} tokens`);
      }
    } catch (e) {
      console.warn(`[holdings] Jupiter token fetch failed:`, e instanceof Error ? e.message : e);
    }

    // 3. Fetch prices from Jupiter for all mints
    console.log(`[holdings] Fetching prices from Jupiter for ${mints.length} tokens`);
    let priceMap = {};
    try {
      const priceRes = await fetch(`${JUPITER_PRICE_URL}?ids=${mints.join(",")}`);
      if (priceRes.ok) {
        const priceData = await priceRes.json();
        if (priceData.data) {
          Object.entries(priceData.data).forEach(([mint, info]) => {
            const price = parseFloat(info.price ?? "0");
            if (price > 0) {
              priceMap[mint] = price;
            }
          });
        }
        console.log(`[holdings] Got prices for ${Object.keys(priceMap).length} tokens`);
      }
    } catch (e) {
      console.warn(`[holdings] Jupiter price fetch failed:`, e instanceof Error ? e.message : e);
    }

    // 4. Build response
    const result = tokens.map((t) => {
      const jupMeta = jupTokenMap[t.mint];
      const symbol = jupMeta?.symbol ?? t.mint.slice(0, 6).toUpperCase();
      const name = jupMeta?.name ?? "Unknown Token";
      const logo = jupMeta?.logoURI || undefined;
      const pricePerToken = priceMap[t.mint] ?? 0;
      const totalPrice = pricePerToken > 0 ? t.uiAmount * pricePerToken : undefined;

      if (symbol === "PIGEON" || t.mint === "4fSWEw2wbYEUCcMtitzmeGUfqinoafXxkhqZrA9Gpump") {
        console.log(`[holdings] PIGEON: balance=${t.uiAmount}, price=${pricePerToken}, total=${totalPrice}`);
      }

      return {
        id: t.mint,
        interface: "FungibleToken",
        token_info: {
          symbol,
          decimals: t.decimals,
          balance: t.rawAmount,
          price_info: pricePerToken > 0
            ? { price_per_token: pricePerToken, total_price: totalPrice }
            : undefined,
        },
        content: {
          metadata: { name, symbol },
          links: { image: logo },
        },
      };
    });

    console.log(`[holdings] Returning ${result.length} items`);
    res.json({ items: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[holdings] Error:", msg);
    res.status(500).json({ error: "Failed to fetch holdings", message: msg });
  }
};
