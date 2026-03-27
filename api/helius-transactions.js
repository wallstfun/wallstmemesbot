const HELIUS_KEY2 = "8ffc1afb-b4e5-494e-852e-f80ec0f5033e";
const HELIUS_KEY1 = "54385120-28ac-4baa-9774-3f7ba8ccd656";
const HELIUS_V0_URL = "https://api-mainnet.helius-rpc.com/v0";
const JUPITER_SWAP_HISTORY_URL = "https://api.jup.ag/swap/v1/swap-history";

const responseCache = new Map();
const rateLimitStates = new Map();
let lastRequestTime = 0;
const MIN_INTERVAL = 2000;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const { walletAddress } = req.body || {};
  if (!walletAddress) { res.status(400).json({ error: "walletAddress is required" }); return; }

  const cacheKey = "tx-" + walletAddress;

  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.data);
    return;
  }

  const state = rateLimitStates.get(cacheKey);
  if (state && state.pausedUntil > Date.now()) {
    const remaining = Math.ceil((state.pausedUntil - Date.now()) / 1000);
    res.status(429).json({ error: "Rate limited", retryAfter: remaining });
    return;
  }

  const now = Date.now();
  const gap = now - lastRequestTime;
  if (gap < MIN_INTERVAL) await delay(MIN_INTERVAL - gap);

  const keys = [HELIUS_KEY2, HELIUS_KEY1];
  let heliusData = [];
  let allRateLimited = true;

  for (const key of keys) {
    const url = HELIUS_V0_URL + "/addresses/" + walletAddress + "/transactions?api-key=" + key + "&limit=100";
    try {
      lastRequestTime = Date.now();
      const r = await fetch(url);
      if (r.ok) {
        heliusData = await r.json();
        rateLimitStates.delete(cacheKey);
        allRateLimited = false;
        break;
      }
      if (r.status === 429 || r.status === 401) {
        await delay(300);
        continue;
      }
      allRateLimited = false;
      res.status(r.status).json({ error: "Helius returned " + r.status });
      return;
    } catch (err) {
      allRateLimited = false;
      res.status(500).json({ error: "Fetch error" });
      return;
    }
  }

  if (allRateLimited) {
    rateLimitStates.set(cacheKey, { pausedUntil: Date.now() + 180000 });
    res.status(429).json({ error: "Both API keys rate-limited", retryAfter: 180 });
    return;
  }

  // Fetch from Jupiter (supplementary, non-blocking)
  let jupiterData = [];
  try {
    const jupRes = await fetch(JUPITER_SWAP_HISTORY_URL + "?wallet=" + walletAddress + "&limit=100");
    if (jupRes.ok) {
      const jupJson = await jupRes.json();
      jupiterData = Array.isArray(jupJson) ? jupJson : (jupJson?.swaps ?? jupJson?.history ?? []);
    }
  } catch (err) {
    // Non-blocking: Jupiter failure doesn't crash response
  }

  // Merge: Helius primary + unique Jupiter txs
  const heliusSigs = new Set(heliusData.map((tx) => tx.signature).filter(Boolean));
  const uniqueJupiterTxs = jupiterData.filter((tx) => !heliusSigs.has(tx.signature));
  const merged = [...heliusData, ...uniqueJupiterTxs];

  responseCache.set(cacheKey, { data: merged, expiresAt: Date.now() + 30000 });
  res.json(merged);
};
