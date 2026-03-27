import { Router, type Request, type Response } from "express";

const router = Router();

const ALCHEMY_URL = "https://solana-mainnet.g.alchemy.com/v2/9vePK8JAvqdzoDs3Q1kZ4";

const alchemyRpcCall = async (method: string, params: any[]) => {
  const response = await fetch(ALCHEMY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`Alchemy RPC failed with status ${response.status}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`Alchemy RPC error: ${data.error.message}`);
  }

  return data.result;
};

router.post("/alchemy-balance", async (req: Request, res: Response) => {
  try {
    const { wallet } = req.body;

    if (!wallet) {
      res.status(400).json({ error: "wallet is required" });
      return;
    }

    // 1. Fetch SOL balance
    // getBalance returns { context: { slot }, value: <lamports> } — read .value
    const balanceResult = await alchemyRpcCall("getBalance", [wallet]);
    const solBalance = (balanceResult?.value ?? 0) / 1e9;

    // 2. Fetch token accounts
    const tokenAccounts = await alchemyRpcCall("getTokenAccountsByOwner", [
      wallet,
      { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
      { encoding: "jsonParsed" },
    ]);

    // Parse token balances
    const tokens = (tokenAccounts?.value || []).map((account: any) => {
      const parsed = account.account?.data?.parsed?.info;
      return {
        mint: parsed?.mint || "",
        amount: parsed?.tokenAmount?.amount || "0",
        decimals: parsed?.tokenAmount?.decimals || 0,
        uiAmount: parsed?.tokenAmount?.uiAmount || 0,
        owner: parsed?.owner || "",
      };
    });

    res.json({
      wallet,
      solBalance: Number(solBalance.toFixed(4)),
      tokens,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Alchemy balance fetch error:", errorMessage);
    res.status(500).json({
      error: "Failed to fetch balance from Alchemy",
      message: errorMessage,
    });
  }
});

export default router;
