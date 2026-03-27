import { Router, type Request, type Response } from "express";

const router = Router();

const KEY1 = "54385120-28ac-4baa-9774-3f7ba8ccd656";
const KEY2 = "8ffc1afb-b4e5-494e-852e-f80ec0f5033e";
const HELIUS_DAS_BASE = "https://mainnet.helius-rpc.com/?api-key=";

const dasCall = async (key: string, method: string, params: object) => {
  const response = await fetch(HELIUS_DAS_BASE + key, {
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
    const err = new Error(`DAS request failed with status ${response.status}`);
    (err as any).status = response.status;
    throw err;
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`DAS error: ${data.error.message}`);
  }

  return data.result;
};

router.post("/helius-holdings", async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    const keys = [KEY2, KEY1]; // Try Key2 first since Key1 has auth issues
    let lastError: string = "Unknown error";

    for (let attempt = 0; attempt < keys.length; attempt++) {
      const key = keys[attempt];
      try {
        const result = await dasCall(key, "getAssetsByOwner", {
          ownerAddress: walletAddress,
          page: 1,
          limit: 1000,
          options: {
            showFungible: true,
            showNativeBalance: false,
          },
        });

        res.json(result);
        return;
      } catch (err: any) {
        lastError = err.message || "Unknown error";
        const status = err.status;
        if (status === 401 || status === 429) {
          console.warn(`Holdings key ${attempt + 1} failed (${status}). Trying alternate...`);
          continue;
        }
        break;
      }
    }

    console.error("Failed to fetch holdings:", lastError);
    res.status(500).json({
      error: "Failed to fetch holdings from Helius DAS",
      message: lastError,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Holdings proxy error:", errorMessage);
    res.status(500).json({ error: "Server error", message: errorMessage });
  }
});

export default router;
