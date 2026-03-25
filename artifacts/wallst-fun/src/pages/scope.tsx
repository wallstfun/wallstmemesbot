import React, { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flame, RefreshCw, ExternalLink, AlertCircle, TrendingUp } from "lucide-react";
import { LiveIndicator } from "@/components/ui/LiveIndicator";

interface Token {
  tokenAddress: string;
  name: string;
  symbol: string;
  logo?: string;
  marketCap?: number;
  priceChange24h?: number | null;
  priceUsd?: number;
  bondingProgress?: number;
  url?: string;
  volume24h?: number;
  rank?: number;
}

const MIN_MCAP = 20_000;
const POLL_MS = 4 * 60 * 1000; // 4 minutes

async function fetchDexScreener(): Promise<Token[]> {
  const boostRes = await fetch("https://api.dexscreener.com/token-boosts/top/v1");
  if (!boostRes.ok) throw new Error(`DexScreener HTTP ${boostRes.status}`);
  const boosts: any[] = await boostRes.json();
  const addrs = boosts
    .filter((b) => b.chainId === "solana")
    .slice(0, 30)
    .map((b) => b.tokenAddress)
    .join(",");
  if (!addrs) return [];

  const pairsRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addrs}`);
  if (!pairsRes.ok) throw new Error(`DexScreener pairs HTTP ${pairsRes.status}`);
  const pairsJson = await pairsRes.json();
  const pairs: any[] = pairsJson.pairs ?? [];

  // Keep highest-liquidity pair per base token
  const byAddr = new Map<string, any>();
  for (const p of pairs) {
    if (p.chainId !== "solana") continue;
    const a = p.baseToken?.address ?? "";
    if (!a) continue;
    const cur = byAddr.get(a);
    if (!cur || (p.liquidity?.usd ?? 0) > (cur.liquidity?.usd ?? 0)) byAddr.set(a, p);
  }

  return Array.from(byAddr.values())
    .filter((p) => (p.marketCap ?? 0) >= MIN_MCAP)
    .slice(0, 20)
    .map((p, i) => ({
      tokenAddress: p.baseToken?.address ?? "",
      name: p.baseToken?.name || "Unknown",
      symbol: p.baseToken?.symbol || "???",
      logo: p.info?.imageUrl,
      marketCap: p.marketCap ?? p.fdv ?? 0,
      priceUsd: parseFloat(p.priceUsd ?? "0"),
      priceChange24h: p.priceChange?.h24 ?? null,
      bondingProgress:
        (p.liquidity?.usd ?? 0) > 0 && (p.marketCap ?? 0) > 0
          ? Math.min((p.liquidity.usd / p.marketCap) * 100, 100)
          : 0,
      url: p.url ?? `https://dexscreener.com/solana/${p.baseToken?.address}`,
      volume24h: p.volume?.h24 ?? 0,
      rank: i + 1,
    }));
}

async function fetchTrendingTokens(): Promise<Token[]> {
  return fetchDexScreener();
}

export default function ScopePage() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const tokenCacheRef = useRef<Token[]>([]);

  const poll = useCallback(async () => {
    try {
      const fresh = await fetchTrendingTokens();
      if (fresh && fresh.length > 0) {
        tokenCacheRef.current = fresh;
        setTokens(fresh);
        setLastUpdated(new Date());
        setError(null);
      } else if (tokenCacheRef.current.length > 0) {
        setTokens(tokenCacheRef.current);
        setLastUpdated(new Date());
      } else {
        throw new Error("No tokens found above $20K market cap");
      }
    } catch (err) {
      if (tokenCacheRef.current.length === 0) {
        setError(err instanceof Error ? err.message : "Failed to fetch tokens");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => clearInterval(interval);
  }, [poll]);

  useEffect(() => {
    if (!lastUpdated) return;
    const t = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [lastUpdated]);

  const formatMarketCap = (cap: number | undefined) => {
    if (!cap || cap === 0) return "—";
    if (cap >= 1_000_000_000) return `$${(cap / 1_000_000_000).toFixed(2)}B`;
    if (cap >= 1_000_000) return `$${(cap / 1_000_000).toFixed(1)}M`;
    if (cap >= 1_000) return `$${(cap / 1_000).toFixed(1)}K`;
    return `$${cap.toFixed(0)}`;
  };

  const formatVolume = (vol: number | undefined) => {
    if (!vol || vol === 0) return "—";
    if (vol >= 1_000_000_000) return `$${(vol / 1_000_000_000).toFixed(2)}B`;
    if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
    if (vol >= 1_000) return `$${(vol / 1_000).toFixed(1)}K`;
    return `$${vol.toFixed(0)}`;
  };

  const shortenAddress = (address: string) =>
    `${address.slice(0, 6)}...${address.slice(-4)}`;

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
            <Flame className="w-9 h-9 text-orange-500" /> Scope 👀
          </h1>
        </div>
        <div className="bg-card px-4 py-2 rounded-lg border border-border shadow-sm">
          <LiveIndicator text="SCANNING WEB3" />
        </div>
      </div>

      {error && (
        <div className="bg-losses/10 border border-losses/30 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-losses flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-losses">{error}</p>
            <button
              onClick={poll}
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
          <p className="text-muted-foreground">No tokens found above $20K market cap</p>
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
                      {index === 0 && <span className="flex items-center gap-0.5 text-sm">🏆<span className="text-xs">1</span></span>}
                      {index === 1 && <span className="flex items-center gap-0.5 text-sm">🥈<span className="text-xs">2</span></span>}
                      {index === 2 && <span className="flex items-center gap-0.5 text-sm">🥉<span className="text-xs">3</span></span>}
                      {index > 2 && <span className="text-lg">#{index + 1}</span>}
                    </div>

                    {/* Token Logo & Name */}
                    <div className="flex items-center gap-2">
                      {token.logo ? (
                        <img
                          src={token.logo}
                          alt={token.symbol}
                          className="w-8 h-8 rounded-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                          {token.symbol?.[0] ?? "?"}
                        </div>
                      )}
                      <div>
                        <h3 className="font-bold text-lg">{token.symbol}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-1">{token.name}</p>
                      </div>
                    </div>
                  </div>

                  {/* 24h Price Change Badge */}
                  {token.priceChange24h == null ? (
                    <Badge variant="outline" className="bg-muted/10 text-muted-foreground font-semibold text-xs">
                      24h: —
                    </Badge>
                  ) : (
                    <Badge
                      className={
                        token.priceChange24h >= 0
                          ? "bg-gains/10 text-gains hover:bg-gains/20 font-semibold text-xs"
                          : "bg-losses/10 text-losses hover:bg-losses/20 font-semibold text-xs"
                      }
                    >
                      {token.priceChange24h >= 0 ? "+" : ""}
                      {token.priceChange24h.toFixed(2)}% 24h
                    </Badge>
                  )}
                </div>

                <div className="space-y-3">
                  {/* 24H Vol + Market Cap */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-primary/5 border border-primary/20 p-3 rounded-lg">
                      <div className="text-[10px] uppercase tracking-wider text-primary/70 font-semibold mb-1 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> 24H VOL
                      </div>
                      <div className="font-mono text-sm font-bold text-primary">
                        {formatVolume(token.volume24h)}
                      </div>
                    </div>
                    <div className="bg-muted/20 p-3 rounded-lg border border-border/50">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                        Market Cap
                      </div>
                      <div className="font-mono text-sm font-bold text-foreground">
                        {formatMarketCap(token.marketCap)}
                      </div>
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
                            background: `linear-gradient(to right, rgb(16,185,129) 0%, rgb(16,185,129) ${Math.min(token.bondingProgress ?? 0, 100)}%, rgb(59,130,246) ${Math.min(token.bondingProgress ?? 0, 100)}%, rgb(59,130,246) 100%)`,
                            width: "100%",
                          }}
                        />
                      </div>
                      <span className="text-xs font-mono font-bold whitespace-nowrap">
                        {(token.bondingProgress ?? 0).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {/* View on Birdeye Button */}
                  <a
                    href={token.url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full mt-4 px-3 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors font-medium text-sm"
                  >
                    View on Explorer
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
