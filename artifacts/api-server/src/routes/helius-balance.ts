import { Router, type Request, type Response } from "express";

const router = Router();

const KEY1 = "54385120-28ac-4baa-9774-3f7ba8ccd656";
const KEY2 = "8ffc1afb-b4e5-494e-852e-f80ec0f5033e";
const HELIUS_RPC_URL_BASE = "https://mainnet.helius-rpc.com/?api-key=";

let currentKeyIndex = 0;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const rpcCall = async (key: string, method: string, params: any[]) => {
  const url = HELIUS_RPC_URL_BASE + key;
  const response = await fetch(url, {
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
    throw new Error(`RPC request failed with status ${response.status}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`RPC error: ${data.error.message}`);
  }

  return data.result;
};

router.post("/helius-balance", async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    const keys = [KEY1, KEY2];
    let lastError: any = null;

    // Try both keys with fallback
    for (let attempt = 0; attempt < 2; attempt++) {
      const key = keys[currentKeyIndex];
      currentKeyIndex = (currentKeyIndex + 1) % 2; // round-robin

      try {
        const result = await rpcCall(key, "getBalance", [walletAddress]);
        // Extract balance from RPC response (it may be nested in 'value' field)
        const lamports = typeof result === 'object' && result !== null && 'value' in result 
          ? result.value 
          : result;
        // Convert lamports to SOL (1 SOL = 1e9 lamports)
        const solBalance = lamports / 1e9;

        res.json({
          wallet: walletAddress,
          balance: solBalance,
          lamports: lamports,
          timestamp: new Date().toISOString(),
        });
        return;
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Unknown error";
        console.warn(`Key ${attempt + 1} failed for getBalance:`, lastError);
        
        // Try alternate key with small delay
        if (attempt === 0) {
          await delay(200);
        }
      }
    }

    // Both keys failed
    console.error(`Failed to fetch balance for ${walletAddress}:`, lastError);
    res.status(500).json({
      error: "Failed to fetch balance from Helius",
      message: lastError,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Balance fetch error:", errorMessage);
    res.status(500).json({
      error: "Server error",
      message: errorMessage,
    });
  }
});

export default router;
