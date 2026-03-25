import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flame, RefreshCw, ExternalLink, AlertCircle } from "lucide-react";
import { LiveIndicator } from "@/components/ui/LiveIndicator";

interface PumpToken {
  tokenAddress: string;
  name: string;
  symbol: string;
  logo?: string;
  marketCap?: number;
  priceChange24h?: number;
  priceChange1m?: number | null;
  priceUsd?: number;
  bondingProgress?: number;
  url?: string;
}

const MORALIS_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjJkOWY2ZmM0LTczZGEtNDEwZC1iYjVlLTk1N2VlMjI4OGU3NCIsIm9yZ0lkIjoiNTA2OTQ1IiwidXNlcklkIjoiNTIxNjE0IiwidHlwZUlkIjoiNjE1MTFhYTYtMTk5ZS00OWVkLThiODktNTc2YjI1NGMxOTkwIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NzQzOTQxMTUsImV4cCI6NDkzMDE1NDExNX0.bPd42MqB0lwTbLivIX-4pFReN-F0LgB3rMplN-UsnHQ";
const BIRDEYE_API_KEY = "41a3c0487a6b451abd0e258f9a77493a";
const BIRDEYE_HEADERS = {
  "X-API-KEY": BIRDEYE_API_KEY,
  "x-chain": "solana",
  Accept: "application/json",
};

interface PriceSnapshot { price: number; ts: number; }

function compute1mChange(history: PriceSnapshot[], currentPrice: number, now: number): number {
  if (history.length < 2 || currentPrice <= 0) return NaN;
  const oneMinAgo = now - 60_000;
  const candidate = [...history].filter(h => h.ts <= oneMinAgo + 10_000).pop();
  if (!candidate || candidate.price <= 0) return NaN;
  return ((currentPrice - candidate.price) / candidate.price) * 100;
}

export default function ScopePage() {
  const [tokens, setTokens] = useState<PumpToken[]>([]);
  const priceHistoryRef = useRef<Record<string, PriceSnapshot[]>>({});
  const allFetchedTokensRef = useRef<PumpToken[]>([]);
  const tokenCacheRef = useRef<PumpToken[]>([]);
  const zeroChangeCountersRef = useRef<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);

  const fetchTokens = async () => {
    setLoading(true);
    setError(null);

    try {
      let uniqueTokens: PumpToken[] = [];

      // --- Primary: Moralis bonding+graduated (rich metadata) ---
      try {
        const headers = { "X-API-Key": MORALIS_API_KEY, Accept: "application/json" };
        const [bondingRes, graduatedRes] = await Promise.all([
          fetch("https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun/bonding?limit=50", { headers }),
          fetch("https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun/graduated?limit=50", { headers }),
        ]);
        if (!bondingRes.ok || !graduatedRes.ok) throw new Error("Moralis non-OK");
        const [bondingData, graduatedData] = await Promise.all([bondingRes.json(), graduatedRes.json()]);

        const allTokens: PumpToken[] = [];
        const add = (token: any, graduated: boolean) => {
          if (!token.tokenAddress || !token.symbol) return;
          allTokens.push({
            tokenAddress: token.tokenAddress,
            name: token.name || "Unknown",
            symbol: token.symbol,
            logo: token.logo,
            marketCap: parseFloat(token.fullyDilutedValuation) || 0,
            priceChange24h: 0,
            priceChange1m: null,
            priceUsd: parseFloat(token.priceUsd) || 0,
            bondingProgress: graduated ? 100 : token.bondingCurveProgress || 0,
            url: `https://pump.fun/${token.tokenAddress}`,
          });
        };
        (bondingData.result ?? []).forEach((t: any) => add(t, false));
        (graduatedData.result ?? []).forEach((t: any) => add(t, true));
        uniqueTokens = Array.from(new Map(allTokens.map((t) => [t.tokenAddress, t])).values())
          .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
        console.log("[wallst.fun] Moralis: loaded", uniqueTokens.length, "tokens");
      } catch {
        // --- Fallback: DexScreener Pump.fun pairs (no API key, provides symbol/mcap/price) ---
        try {
          const res = await fetch(
            "https://api.dexscreener.com/latest/dex/search?q=pump.fun&chainId=solana",
            { headers: { Accept: "application/json" } }
          );
          if (res.ok) {
            const data = await res.json();
            const seen = new Set<string>();
            for (const pair of data?.pairs ?? []) {
              if (pair.chainId !== "solana") continue;
              const addr = pair.baseToken?.address ?? "";
              if (!addr.endsWith("pump")) continue;
              if (seen.has(addr)) continue;
              seen.add(addr);
              uniqueTokens.push({
                tokenAddress: addr,
                name: pair.baseToken?.name || "Unknown",
                symbol: pair.baseToken?.symbol || addr.slice(0, 6).toUpperCase(),
                logo: pair.info?.imageUrl,
                marketCap: pair.fdv ?? 0,
                priceChange24h: 0,
                priceChange1m: null,
                priceUsd: parseFloat(pair.priceUsd ?? "0") || 0,
                bondingProgress: 100,
                url: `https://pump.fun/${addr}`,
              });
            }
            uniqueTokens.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
            console.log("[wallst.fun] DexScreener fallback: loaded", uniqueTokens.length, "tokens");
          }
        } catch { /* silent */ }
      }

      // If both APIs failed, use the in-memory cache silently
      if (uniqueTokens.length === 0 && tokenCacheRef.current.length > 0) {
        uniqueTokens = tokenCacheRef.current;
        console.log("[wallst.fun] Using token cache:", uniqueTokens.length, "tokens");
      }

      if (uniqueTokens.length === 0) throw new Error("No tokens available");

      tokenCacheRef.current = uniqueTokens;
      // Store all fetched tokens for replacement lookups
      allFetchedTokensRef.current = uniqueTokens;

      const topTokens = uniqueTokens.slice(0, 12);

      // Seed Birdeye OHLCV history sequentially (fire-and-forget) to avoid rate limits.
      const now = Date.now();
      const timeFrom = Math.floor((now - 150_000) / 1000);
      const timeTo = Math.floor(now / 1000);
      void (async () => {
        for (const token of topTokens) {
          try {
            const res = await fetch(
              `https://public-api.birdeye.so/defi/ohlcv?address=${token.tokenAddress}&type=1m&time_from=${timeFrom}&time_to=${timeTo}&currency=usd`,
              { headers: BIRDEYE_HEADERS }
            );
            if (!res.ok) continue;
            const data = await res.json();
            const items: any[] = data?.data?.items ?? [];
            if (items.length === 0) continue;
            const hist = priceHistoryRef.current[token.tokenAddress] ?? [];
            items.forEach((candle: any) => {
              const ts = candle.unixTime * 1000;
              if (!hist.find((h) => Math.abs(h.ts - ts) < 5_000)) {
                hist.push({ price: candle.c, ts });
              }
            });
            priceHistoryRef.current[token.tokenAddress] = hist.filter(
              (h) => now - h.ts <= 90_000
            );
          } catch {
            // brand-new tokens may have no OHLCV yet — ignore silently
          }
          await new Promise((r) => setTimeout(r, 1_000));
        }
      })();

      // Preserve any 1m change already computed by the running price poll
      setTokens((prev) => {
        const prevMap = new Map(prev.map((t) => [t.tokenAddress, t]));
        return topTokens.map((t) => ({
          ...t,
          priceChange1m: prevMap.get(t.tokenAddress)?.priceChange1m ?? null,
        }));
      });
      setLastUpdated(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error occurred";
      setError(message);
      console.error("[wallst.fun] Scope fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh token list every 60 seconds (conserves Moralis CU limits)
  useEffect(() => {
    fetchTokens();
    const interval = setInterval(fetchTokens, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Birdeye multi_price poll every 5 seconds — single request for all top tokens
  useEffect(() => {
    const fetchPrices = async () => {
      const current = allFetchedTokensRef.current.slice(0, 12);
      if (current.length === 0) return;

      const now = Date.now();
      const addresses = current.map((t) => t.tokenAddress).join(",");

      try {
        const res = await fetch(
          `https://public-api.birdeye.so/defi/multi_price?list_address=${addresses}`,
          { headers: BIRDEYE_HEADERS }
        );
        if (!res.ok) return;
        const data = await res.json();
        const priceMap: Record<string, { value: number }> = data?.data ?? {};

        setTokens((prev) =>
          prev.map((token) => {
            const priceData = priceMap[token.tokenAddress];
            if (!priceData || priceData.value <= 0) return token;

            const price = priceData.value;
            const hist = priceHistoryRef.current[token.tokenAddress] ?? [];
            hist.push({ price, ts: now });
            priceHistoryRef.current[token.tokenAddress] = hist.filter(
              (h) => now - h.ts <= 90_000
            );

            const change1m = compute1mChange(
              priceHistoryRef.current[token.tokenAddress],
              price,
              now
            );

            const isZero = change1m === null || Math.abs(change1m) < 0.001;
            zeroChangeCountersRef.current[token.tokenAddress] = isZero
              ? (zeroChangeCountersRef.current[token.tokenAddress] || 0) + 1
              : 0;

            return { ...token, priceUsd: price, priceChange1m: change1m };
          })
        );
      } catch {
        // ignore
      }
    };

    const interval = setInterval(fetchPrices, 5_000);
    return () => clearInterval(interval);
  }, []);

  // Update "seconds ago" display every second
  useEffect(() => {
    if (!lastUpdated) return;
    
    const updateTimer = setInterval(() => {
      const now = new Date();
      const diff = Math.floor((now.getTime() - lastUpdated.getTime()) / 1000);
      setSecondsAgo(diff);
    }, 1000);

    return () => clearInterval(updateTimer);
  }, [lastUpdated]);


  const formatMarketCap = (cap: number | undefined) => {
    if (!cap || cap === 0) return "—";
    if (cap >= 1000000) return `$${(cap / 1000000).toFixed(1)}M`;
    if (cap >= 1000) return `$${(cap / 1000).toFixed(1)}K`;
    return `$${cap.toFixed(0)}`;
  };

  const shortenAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const copyToClipboard = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-serif font-bold text-foreground flex items-center gap-3">
            <Flame className="w-9 h-9 text-orange-500" /> WallStSmith's Scope 👀
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchTokens}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <div className="bg-card px-4 py-2 rounded-lg border border-border shadow-sm">
            <LiveIndicator text="SCANNING WEB3" />
          </div>
        </div>
      </div>

      {lastUpdated && (
        <p className="text-xs text-muted-foreground">
          Last updated: {secondsAgo}s ago ({lastUpdated.toLocaleTimeString()})
        </p>
      )}

      {error && (
        <div className="bg-losses/10 border border-losses/30 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-losses flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-losses">{error}</p>
            <button
              onClick={fetchTokens}
              className="text-xs text-losses hover:text-losses/80 mt-2 underline"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {loading && tokens.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border-border/50 bg-gradient-to-b from-card to-background">
              <CardContent className="p-6">
                <div className="space-y-4 animate-pulse">
                  <div className="h-6 bg-muted rounded w-3/4"></div>
                  <div className="h-4 bg-muted rounded w-1/2"></div>
                  <div className="h-4 bg-muted rounded w-2/3"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && tokens.length === 0 && !error && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No tokens found</p>
        </div>
      )}

      {tokens.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tokens.map((token, index) => (
            <Card
              key={token.tokenAddress}
              className="border-border/50 hover:border-primary/50 transition-all duration-300 shadow-sm group bg-gradient-to-b from-card to-background hover:shadow-lg hover:scale-105"
            >
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    {/* Rank Badge */}
                    <div className="w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center font-serif font-bold text-foreground shadow-md">
                      {index + 1 === 1 && <span className="flex items-center gap-0.5 text-sm">🏆<span className="text-xs">1</span></span>}
                      {index + 1 === 2 && <span className="flex items-center gap-0.5 text-sm">🥈<span className="text-xs">2</span></span>}
                      {index + 1 === 3 && <span className="flex items-center gap-0.5 text-sm">🥉<span className="text-xs">3</span></span>}
                      {index + 1 > 3 && <span className="text-lg">#{index + 1}</span>}
                    </div>

                    {/* Token Logo & Name */}
                    <div className="flex items-center gap-2">
                      {token.logo ? (
                        <img
                          src={token.logo}
                          alt={token.symbol}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                          {token.symbol[0]}
                        </div>
                      )}
                      <div>
                        <h3 className="font-bold text-lg">{token.symbol}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-1">{token.name}</p>
                      </div>
                    </div>
                  </div>

                  {/* Price Change Badge (1m) */}
                  {(token.priceChange1m === null || token.priceChange1m === undefined || Number.isNaN(token.priceChange1m)) ? (
                    <Badge variant="outline" className="bg-muted/10 text-muted-foreground font-semibold">
                      1m: —
                    </Badge>
                  ) : (
                    <Badge
                      variant={(token.priceChange1m ?? 0) >= 0 ? "default" : "destructive"}
                      className={
                        (token.priceChange1m ?? 0) >= 0
                          ? "bg-gains/10 text-gains hover:bg-gains/20 font-semibold"
                          : "bg-losses/10 text-losses hover:bg-losses/20 font-semibold"
                      }
                    >
                      {(token.priceChange1m ?? 0) >= 0 ? "+" : ""}
                      {(token.priceChange1m ?? 0).toFixed(2)}% 1m
                    </Badge>
                  )}
                </div>

                <div className="space-y-3">
                  {/* Market Cap */}
                  <div className="bg-muted/20 p-3 rounded-lg border border-border/50">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                      Market Cap
                    </div>
                    <div className="font-mono text-sm font-bold text-foreground">
                      {formatMarketCap(token.marketCap)}
                    </div>
                  </div>

                  {/* Contract Address */}
                  <button
                    onClick={() => copyToClipboard(token.tokenAddress)}
                    className="w-full bg-muted/20 p-3 rounded-lg border border-border/50 hover:border-primary/30 hover:bg-muted/40 transition-all text-left group"
                  >
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                      Contract Address
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                        {shortenAddress(token.tokenAddress)}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors">
                        {copiedAddress === token.tokenAddress ? "✓ Copied" : "Copy"}
                      </span>
                    </div>
                  </button>

                  {/* Bonding Progress */}
                  <div className="bg-muted/20 p-3 rounded-lg border border-border/50">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                      Bonding Progress
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-background rounded-full h-2 overflow-hidden border border-border/50">
                        <div
                          className="h-full transition-all"
                          style={{
                            background: `linear-gradient(to right, rgb(16, 185, 129) 0%, rgb(16, 185, 129) ${Math.min(token.bondingProgress, 100)}%, rgb(59, 130, 246) ${Math.min(token.bondingProgress, 100)}%, rgb(59, 130, 246) 100%)`,
                            width: '100%'
                          }}
                        ></div>
                      </div>
                      <span className="text-xs font-mono font-bold whitespace-nowrap">
                        {token.bondingProgress.toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {/* View on Pump.fun Button */}
                  <a
                    href={token.url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full mt-4 px-3 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors font-medium text-sm"
                  >
                    View on Pump.fun
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
