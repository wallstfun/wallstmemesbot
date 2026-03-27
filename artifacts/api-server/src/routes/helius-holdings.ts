import { Router, type Request, type Response } from "express";

const router = Router();

// Holdings now use Alchemy exclusively — keeps Helius keys free for transactions only
const ALCHEMY_URL = "https://solana-mainnet.g.alchemy.com/v2/9vePK8JAvqdzoDs3Q1kZ4";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

// Hardcoded metadata for well-known tokens — always correct, no API needed
const KNOWN_TOKENS: Record<string, { symbol: string; name: string; logoURI: string }> = {
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": {
    symbol: "USDC",
    name: "USD Coin",
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
  },
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenEsw": {
    symbol: "USDT",
    name: "Tether USD",
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenEsw/logo.svg",
  },
  "So11111111111111111111111111111111111111112": {
    symbol: "SOL",
    name: "Solana",
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  },
  // PIGEON token
  "4fSWEw2wbYEUCcMtitzmeGUfqinoafXxkhqZrA9Gpump": {
    symbol: "PIGEON",
    name: "Pigeon Token",
    logoURI: "",
  },
};

interface TokenAccount {
  mint: string;
  balance: number;
  decimals: number;
}

router.post("/helius-holdings", async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    // 1. Fetch all SPL token accounts via Alchemy RPC
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
        const mint = info.mint as string;
        if (uiAmount <= 0) {
          if (mint === "4fSWEw2wbYEUCcMtitzmeGUfqinoafXxkhqZrA9Gpump") {
            console.log(`[holdings] PIGEON (${mint}): uiAmount=${uiAmount}, FILTERED OUT`);
          }
          return null;
        }
        if (mint === "4fSWEw2wbYEUCcMtitzmeGUfqinoafXxkhqZrA9Gpump") {
          console.log(`[holdings] PIGEON found: uiAmount=${uiAmount}, decimals=${info.tokenAmount?.decimals}`);
        }
        return {
          mint,
          balance: uiAmount as number,
          decimals: (info.tokenAmount?.decimals ?? 0) as number,
        };
      })
      .filter((t): t is TokenAccount => t !== null);

    console.log(`[holdings] After filtering: ${tokenAccounts.length} tokens`);
    if (tokenAccounts.length === 0) {
      res.json({ items: [] });
      return;
    }

    const mints = tokenAccounts.map((t) => t.mint);

    // 2. Fetch token metadata — use hardcoded map first, then Jupiter API for unknowns
    const metadataMap: Record<string, { symbol: string; name: string; logoURI?: string }> = {};

    // Pre-populate from KNOWN_TOKENS (never needs a network call)
    for (const mint of mints) {
      if (KNOWN_TOKENS[mint]) {
        metadataMap[mint] = KNOWN_TOKENS[mint];
      }
    }

    // Only call Jupiter for mints not already resolved
    const unknownMints = mints.filter((m) => !metadataMap[m]);
    await Promise.allSettled(
      unknownMints.map(async (mint) => {
        try {
          const r = await fetch(`https://tokens.jup.ag/token/${mint}`, {
            headers: { Accept: "application/json" },
          });
          if (r.ok) {
            const t = await r.json();
            metadataMap[mint] = {
              symbol: t.symbol || mint.slice(0, 6).toUpperCase(),
              name: t.name || "Unknown Token",
              logoURI: t.logoURI || undefined,
            };
          }
        } catch {
          // Silently skip — fallback applied below
        }
      })
    );

    // 3. Fetch prices from DexScreener (batch, up to 30 mints)
    const priceMap: Record<string, number> = {};
    try {
      const mintList = mints.slice(0, 30).join(",");
      const dexRes = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mintList}`, {
        headers: { Accept: "application/json" },
      });
      if (dexRes.ok) {
        const dexData = await dexRes.json();
        const pairs = Array.isArray(dexData) ? dexData : [];
        for (const pair of pairs) {
          const addr = pair.baseToken?.address;
          const price = parseFloat(pair.priceUsd ?? "0");
          if (addr && price > 0 && !priceMap[addr]) {
            priceMap[addr] = price;
          }
        }
      }
    } catch (e) {
      console.warn("[holdings] DexScreener price fetch failed:", e instanceof Error ? e.message : e);
    }

    // 4. Build response in the same shape the frontend expects
    const items = tokenAccounts.map(({ mint, balance, decimals }) => {
      const meta = metadataMap[mint];
      const priceUsd = priceMap[mint] ?? 0;
      const valueUsd = priceUsd > 0 ? balance * priceUsd : undefined;
      const symbol = meta?.symbol || mint.slice(0, 6).toUpperCase();
      const name = meta?.name || "Unknown Token";

      return {
        id: mint,
        interface: "FungibleToken",
        token_info: {
          symbol,
          decimals,
          balance: balance * Math.pow(10, decimals),
          price_info: priceUsd > 0
            ? { price_per_token: priceUsd, total_price: valueUsd }
            : undefined,
        },
        content: {
          metadata: { name, symbol },
          links: { image: meta?.logoURI || undefined },
        },
      };
    });

    res.json({ items });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[holdings] Error:", msg);
    res.status(500).json({ error: "Server error", message: msg });
  }
});

export default router;
