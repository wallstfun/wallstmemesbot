const HELIUS_KEY2 = "8ffc1afb-b4e5-494e-852e-f80ec0f5033e";
const HELIUS_KEY1 = "54385120-28ac-4baa-9774-3f7ba8ccd656";
const HELIUS_DAS_BASE = "https://mainnet.helius-rpc.com/?api-key=";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const { walletAddress } = req.body || {};
  if (!walletAddress) { res.status(400).json({ error: "walletAddress is required" }); return; }

  const keys = [HELIUS_KEY2, HELIUS_KEY1];
  let lastError = "";

  for (const key of keys) {
    try {
      const r = await fetch(HELIUS_DAS_BASE + key, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [walletAddress] }),
      });
      if (!r.ok) throw new Error(`RPC failed: ${r.status}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error.message);
      const lamports = typeof d.result === "object" && d.result !== null && "value" in d.result
        ? d.result.value
        : d.result;
      res.json({ wallet: walletAddress, balance: lamports / 1e9, lamports, timestamp: new Date().toISOString() });
      return;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Unknown error";
    }
  }

  res.status(500).json({ error: "Failed to fetch balance", message: lastError });
};
