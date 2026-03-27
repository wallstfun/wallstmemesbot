import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);

const HELIUS_KEY1 = "54385120-28ac-4baa-9774-3f7ba8ccd656";
const HELIUS_KEY2 = "8ffc1afb-b4e5-494e-852e-f80ec0f5033e";
const HELIUS_V0_URL = "https://api-mainnet.helius-rpc.com/v0";
const HELIUS_DAS_BASE = "https://mainnet.helius-rpc.com/?api-key=";
const ALCHEMY_URL = "https://solana-mainnet.g.alchemy.com/v2/9vePK8JAvqdzoDs3Q1kZ4";

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── POST /api/alchemy-balance ────────────────────────────────────────────────
app.post("/api/alchemy-balance", async (req, res) => {
  try {
    const { wallet } = req.body;
    if (!wallet) { res.status(400).json({ error: "wallet is required" }); return; }

    const rpc = async (method: string, params: unknown[]) => {
      const r = await fetch(ALCHEMY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (!r.ok) throw new Error(`Alchemy RPC failed: ${r.status}`);
      const d = await r.json() as { error?: { message: string }; result: unknown };
      if (d.error) throw new Error(d.error.message);
      return d.result;
    };

    const solLamports = await rpc("getBalance", [wallet]) as number;
    const solBalance = solLamports / 1e9;

    const tokenAccounts = await rpc("getTokenAccountsByOwner", [
      wallet,
      { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
      { encoding: "jsonParsed" },
    ]) as { value: unknown[] };

    const tokens = ((tokenAccounts?.value) || []).map((account: unknown) => {
      const acc = account as { account?: { data?: { parsed?: { info?: { mint?: string; tokenAmount?: { amount?: string; decimals?: number; uiAmount?: number }; owner?: string } } } } };
      const parsed = acc.account?.data?.parsed?.info;
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
});

// ── POST /api/helius-transactions ─────────────────────────────────────────────
const txRateLimitStates = new Map<string, { pausedUntil: number }>();
const txResponseCache = new Map<string, { data: any; expiresAt: number }>();
const JUPITER_SWAP_API = "https://api.jup.ag/swap/wallet";

app.post("/api/helius-transactions", async (req, res) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress) { res.status(400).json({ error: "walletAddress is required" }); return; }

    const cacheKey = `helius-${walletAddress}`;
    
    // Check cache
    const cached = txResponseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json(cached.data);
      return;
    }

    const state = txRateLimitStates.get(cacheKey) || { pausedUntil: 0 };
    if (state.pausedUntil > Date.now()) {
      const s = Math.ceil((state.pausedUntil - Date.now()) / 1000);
      res.status(429).json({ error: "Rate limited", retryAfter: s });
      return;
    }

    // Fetch from Helius (primary)
    let heliusData: any[] = [];
    const keys = [HELIUS_KEY2, HELIUS_KEY1];
    let allFailed = true;

    for (const key of keys) {
      const url = `${HELIUS_V0_URL}/addresses/${walletAddress}/transactions?api-key=${key}&limit=100`;
      try {
        const r = await fetch(url);
        if (r.ok) {
          heliusData = await r.json();
          txRateLimitStates.delete(cacheKey);
          allFailed = false;
          break;
        }
        if (r.status === 429 || r.status === 401) { await delay(300); continue; }
        allFailed = false;
        break;
      } catch (e) {
        allFailed = false;
        break;
      }
    }

    if (allFailed) {
      txRateLimitStates.set(cacheKey, { pausedUntil: Date.now() + 180000 });
      res.status(429).json({ error: "Both keys rate-limited", retryAfter: 180 });
      return;
    }

    // Fetch from Jupiter (supplementary) — non-blocking
    let jupiterData: any[] = [];
    try {
      const jupRes = await fetch(`${JUPITER_SWAP_API}/${walletAddress}?limit=100`);
      if (jupRes.ok) {
        const jupJson = await jupRes.json();
        jupiterData = Array.isArray(jupJson) ? jupJson : (jupJson?.swaps ?? []);
      }
    } catch (err) {
      // Non-blocking
    }

    // Merge: Helius primary, add Jupiter fills not in Helius
    const heliusSigs = new Set(heliusData.map((tx) => tx.signature).filter(Boolean));
    const uniqueJupiterTxs = jupiterData.filter((tx) => !heliusSigs.has(tx.signature));
    const merged = [...heliusData, ...uniqueJupiterTxs];

    // Cache and return
    txResponseCache.set(cacheKey, { data: merged, expiresAt: Date.now() + 30000 });
    res.json(merged);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: "Server error", message: msg });
  }
});

// ── POST /api/helius-holdings ─────────────────────────────────────────────────
app.post("/api/helius-holdings", async (req, res) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress) { res.status(400).json({ error: "walletAddress is required" }); return; }

    const keys = [HELIUS_KEY2, HELIUS_KEY1];
    let lastError = "Unknown error";

    for (let attempt = 0; attempt < keys.length; attempt++) {
      const key = keys[attempt];
      try {
        const r = await fetch(HELIUS_DAS_BASE + key, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 1, method: "getAssetsByOwner",
            params: { ownerAddress: walletAddress, page: 1, limit: 1000, options: { showFungible: true, showNativeBalance: false } },
          }),
        });
        if (!r.ok) {
          const e = new Error(`DAS failed: ${r.status}`) as Error & { status: number };
          e.status = r.status;
          throw e;
        }
        const d = await r.json() as { error?: { message: string }; result: unknown };
        if (d.error) throw new Error(d.error.message);
        res.json(d.result);
        return;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : "Unknown error";
        const status = (err as { status?: number }).status;
        if (status === 401 || status === 429) { console.warn(`Holdings key ${attempt + 1} failed (${status}). Trying alternate...`); continue; }
        break;
      }
    }

    res.status(500).json({ error: "Failed to fetch holdings", message: lastError });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: "Server error", message: msg });
  }
});

// ── POST /api/helius-balance ──────────────────────────────────────────────────
app.post("/api/helius-balance", async (req, res) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress) { res.status(400).json({ error: "walletAddress is required" }); return; }

    const keys = [HELIUS_KEY2, HELIUS_KEY1];
    let lastError = "";

    for (let attempt = 0; attempt < keys.length; attempt++) {
      const key = keys[attempt];
      try {
        const r = await fetch(HELIUS_DAS_BASE + key, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [walletAddress] }),
        });
        if (!r.ok) throw new Error(`RPC failed: ${r.status}`);
        const d = await r.json() as { error?: { message: string }; result: number | { value: number } };
        if (d.error) throw new Error(d.error.message);
        const lamports = typeof d.result === "object" && d.result !== null && "value" in d.result ? d.result.value : d.result as number;
        res.json({ wallet: walletAddress, balance: lamports / 1e9, lamports, timestamp: new Date().toISOString() });
        return;
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Unknown error";
        if (attempt === 0) await delay(200);
      }
    }

    res.status(500).json({ error: "Failed to fetch balance", message: lastError });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: "Server error", message: msg });
  }
});

// ── GET /api/tweets ───────────────────────────────────────────────────────────
app.get("/api/tweets", (_req, res) => {
  res.json({ tweets: [], count: 0, source: "placeholder", message: "X Feed coming soon" });
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Serve Vite static build ───────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "dist")));

// SPA fallback — all non-API routes serve index.html
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "API route not found" });
    return;
  }
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[wallst.fun] Production server running on port ${PORT}`);
});
