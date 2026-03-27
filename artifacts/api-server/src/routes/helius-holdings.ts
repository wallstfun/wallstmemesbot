import { Router, type Request, type Response } from "express";

const router = Router();

const ALCHEMY_URL = "https://solana-mainnet.g.alchemy.com/v2/9vePK8JAvqdzoDs3Q1kZ4";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const JUPITER_TOKENS_URL = "https://token.jup.ag/all";
const JUPITER_PRICE_URL = "https://price.jup.ag/v6/price";

interface TokenAccount {
  mint: string;
  balance: number;
  decimals: number;
  uiAmount: number;
}

router.post("/helius-holdings", async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    // 1. Fetch all SPL token accounts via Alchemy RPC
    console.log(`[holdings] Fetching token accounts for ${walletAddress}`);
    const alchemyRes = await fetch(ALCHEMY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [
          walletAddress,
          { programId: TOKEN_PROGRAM_ID },
          { encoding: "jsonParsed" },
        ],
      }),
    });

    if (!alchemyRes.ok) {
      throw new Error(`Alchemy returned ${alchemyRes.status}`);
    }

    const alchemyData = await alchemyRes.json();
    if (alchemyData.error) {
      throw new Error(`Alchemy RPC error: ${alchemyData.error.message}`);
    }

    const accounts: any[] = alchemyData.result?.value ?? [];
    console.log(`[holdings] Alchemy returned ${accounts.length} token accounts`);

    // Parse and filter out zero-balance accounts
    const tokenAccounts: TokenAccount[] = accounts
      .map((acc: any) => {
        const info = acc.account?.data?.parsed?.info;
        if (!info) return null;
        const uiAmount = info.tokenAmount?.uiAmount ?? 0;
        if (uiAmount <= 0) return null;
        return {
          mint: info.mint as string,
          balance: uiAmount as number,
          decimals: (info.tokenAmount?.decimals ?? 0) as number,
          uiAmount,
        };
      })
      .filter((t): t is TokenAccount => t !== null);

    console.log(`[holdings] Found ${tokenAccounts.length} tokens with balance > 0`);
    if (tokenAccounts.length === 0) {
      res.json({ items: [] });
      return;
    }

    const mints = tokenAccounts.map((t) => t.mint);

    // 2. Fetch all token metadata from Jupiter
    console.log(`[holdings] Fetching metadata from Jupiter for ${mints.length} tokens`);
    let jupTokenMap: Record<string, any> = {};
    try {
      const jupRes = await fetch(JUPITER_TOKENS_URL);
      if (jupRes.ok) {
        const jupList = await jupRes.json();
        jupList.forEach((t: any) => {
          jupTokenMap[t.address] = t;
        });
        console.log(`[holdings] Jupiter returned ${Object.keys(jupTokenMap).length} tokens`);
      }
    } catch (e) {
      console.warn(
        "[holdings] Jupiter token fetch failed:",
        e instanceof Error ? e.message : e
      );
    }

    // 3. Fetch prices from Jupiter
    console.log(`[holdings] Fetching prices from Jupiter for ${mints.length} tokens`);
    let priceMap: Record<string, number> = {};
    try {
      const priceRes = await fetch(`${JUPITER_PRICE_URL}?ids=${mints.join(",")}`);
      if (priceRes.ok) {
        const priceData = await priceRes.json();
        if (priceData.data) {
          Object.entries(priceData.data).forEach(([mint, info]: [string, any]) => {
            const price = parseFloat(info.price ?? "0");
            if (price > 0) {
              priceMap[mint] = price;
            }
          });
        }
        console.log(`[holdings] Got prices for ${Object.keys(priceMap).length} tokens`);
      }
    } catch (e) {
      console.warn(
        "[holdings] Jupiter price fetch failed:",
        e instanceof Error ? e.message : e
      );
    }

    // 4. Build response
    const items = tokenAccounts.map(({ mint, balance, decimals, uiAmount }) => {
      const jupMeta = jupTokenMap[mint];
      const symbol = jupMeta?.symbol ?? mint.slice(0, 6).toUpperCase();
      const name = jupMeta?.name ?? "Unknown Token";
      const logo = jupMeta?.logoURI || undefined;
      const priceUsd = priceMap[mint] ?? 0;
      const valueUsd = priceUsd > 0 ? balance * priceUsd : undefined;

      if (symbol === "PIGEON" || mint === "4fSWEw2wbYEUCcMtitzmeGUfqinoafXxkhqZrA9Gpump") {
        console.log(
          `[holdings] PIGEON: uiAmount=${uiAmount}, price=${priceUsd}, total=${valueUsd}`
        );
      }

      return {
        id: mint,
        interface: "FungibleToken",
        token_info: {
          symbol,
          decimals,
          balance: balance * Math.pow(10, decimals),
          price_info:
            priceUsd > 0
              ? { price_per_token: priceUsd, total_price: valueUsd }
              : undefined,
        },
        content: {
          metadata: { name, symbol },
          links: { image: logo || undefined },
        },
      };
    });

    console.log(`[holdings] Returning ${items.length} items`);
    res.json({ items });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[holdings] Error:", msg);
    res.status(500).json({ error: "Server error", message: msg });
  }
});

export default router;
