const HELIUS_KEY2 = "8ffc1afb-b4e5-494e-852e-f80ec0f5033e";
const HELIUS_KEY1 = "54385120-28ac-4baa-9774-3f7ba8ccd656";
const ALCHEMY_URL = "https://solana-mainnet.g.alchemy.com/v2/9vePK8JAvqdzoDs3Q1kZ4";

const JUPITER_PRICE_URL = "https://price.jup.ag/v6/price";
const DEXSCREENER_URL = "https://api.dexscreener.com/latest/dex/tokens";
const JUPITER_TOKEN_URL = "https://token.jup.ag/all";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const { walletAddress } = req.body || {};
  if (!walletAddress) { res.status(400).json({ error: "walletAddress is required" }); return; }

  try {
    // 1. Get token accounts via Alchemy (no Helius rate limit)
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

    if (!alchemyRes.ok) throw new Error(`Alchemy failed: ${alchemyRes.status}`);
    const alchemyData = await alchemyRes.json();
    if (alchemyData.error) throw new Error(alchemyData.error.message);

    const accounts = alchemyData.result?.value ?? [];
    const tokens = accounts
      .map((acc) => {
        const info = acc?.account?.data?.parsed?.info;
        return info ? {
          mint: info.mint,
          balance: info.tokenAmount?.uiAmount ?? 0,
          decimals: info.tokenAmount?.decimals ?? 0,
          rawAmount: info.tokenAmount?.amount ?? "0",
        } : null;
      })
      .filter((t) => t && t.balance > 0);

    if (tokens.length === 0) {
      res.json({ items: [] });
      return;
    }

    // 2. Fetch Jupiter token metadata
    let jupTokenMap = {};
    try {
      const jupRes = await fetch(JUPITER_TOKEN_URL);
      if (jupRes.ok) {
        const jupList = await jupRes.json();
        jupList.forEach((t) => { jupTokenMap[t.address] = t; });
      }
    } catch { /* non-fatal */ }

    // 3. Fetch prices from DexScreener
    const mints = tokens.map((t) => t.mint);
    let priceMap = {};
    try {
      const dexRes = await fetch(`${DEXSCREENER_URL}/${mints.join(",")}`);
      if (dexRes.ok) {
        const dexData = await dexRes.json();
        (dexData.pairs ?? []).forEach((pair) => {
          if (pair.baseToken?.address && !priceMap[pair.baseToken.address]) {
            priceMap[pair.baseToken.address] = parseFloat(pair.priceUsd ?? "0");
          }
        });
      }
    } catch { /* non-fatal */ }

    // 4. Assemble holdings
    const items = tokens.map((t) => {
      const meta = jupTokenMap[t.mint];
      const priceUsd = priceMap[t.mint] ?? 0;
      return {
        mint: t.mint,
        symbol: meta?.symbol ?? t.mint.slice(0, 6),
        name: meta?.name ?? "Unknown Token",
        logo: meta?.logoURI ?? null,
        balance: t.balance,
        decimals: t.decimals,
        priceUsd,
        valueUsd: t.balance * priceUsd,
      };
    });

    res.json({ items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[helius-holdings]", msg);
    res.status(500).json({ error: "Failed to fetch holdings", message: msg });
  }
};
