const ALCHEMY_URL = "https://solana-mainnet.g.alchemy.com/v2/9vePK8JAvqdzoDs3Q1kZ4";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const { wallet } = req.body || {};
  if (!wallet) { res.status(400).json({ error: "wallet is required" }); return; }

  const rpc = async (method, params) => {
    const r = await fetch(ALCHEMY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!r.ok) throw new Error(`Alchemy RPC failed: ${r.status}`);
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    return d.result;
  };

  try {
    const balanceResult = await rpc("getBalance", [wallet]);
    const solBalance = (balanceResult?.value ?? balanceResult ?? 0) / 1e9;

    const tokenAccounts = await rpc("getTokenAccountsByOwner", [
      wallet,
      { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
      { encoding: "jsonParsed" },
    ]);

    const tokens = (tokenAccounts?.value ?? []).map((account) => {
      const parsed = account?.account?.data?.parsed?.info;
      return {
        mint: parsed?.mint || "",
        amount: parsed?.tokenAmount?.amount || "0",
        decimals: parsed?.tokenAmount?.decimals || 0,
        uiAmount: parsed?.tokenAmount?.uiAmount || 0,
        owner: parsed?.owner || "",
      };
    });

    res.json({ wallet, solBalance: Number(solBalance.toFixed(4)), tokens, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("alchemy-balance error:", msg);
    res.status(500).json({ error: "Failed to fetch balance", message: msg });
  }
};
