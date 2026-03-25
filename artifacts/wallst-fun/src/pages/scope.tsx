import React, { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flame, RefreshCw, ExternalLink, AlertCircle, TrendingUp } from "lucide-react";
import { LiveIndicator } from "@/components/ui/LiveIndicator";

interface BirdeyeToken {
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
const BIRDEYE_URL =
  "/proxy/birdeye/defi/token_trending?sort_by=rank&sort_type=asc&limit=20";

async function fetchBirdeyeTrending(): Promise<BirdeyeToken[]> {
  const res = await fetch(BIRDEYE_URL, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Birdeye API error: ${res.status}`);
  const json = await res.json();
  const items: any[] = json?.data?.tokens ?? json?.data?.items ?? [];

  const tokens: BirdeyeToken[] = [];
  for (const item of items) {
    const mcap = item.marketcap ?? 0;
    if (mcap < MIN_MCAP) continue;

    tokens.push({
      tokenAddress: item.address,
      name: item.name || "Unknown",
      symbol: item.symbol || item.address?.slice(0, 6).toUpperCase() || "???",
      logo: item.logoURI,
      marketCap: mcap,
      priceUsd: item.price ?? 0,
      priceChange24h: item.price24hChangePercent ?? null,
      bondingProgress:
        item.liquidity > 0 && mcap > 0
          ? Math.min((item.liquidity / mcap) * 100, 100)
          : 0,
      url: `https://birdeye.so/token/${item.address}?chain=solana`,
      volume24h: item.volume24hUSD ?? 0,
      rank: item.rank ?? 0,
    });
  }

  return tokens;
}

export default function ScopePage() {
  const [tokens, setTokens] = useState<BirdeyeToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const tokenCacheRef = useRef<BirdeyeToken[]>([]);

  const poll = useCallback(async () => {
    try {
      let fresh = await fetchBirdeyeTrending().catch(() => null);
      if (!fresh || fresh.length === 0) {
        fresh = tokenCacheRef.current.length > 0 ? tokenCacheRef.current : null;
      }
      if (!fresh) throw new Error("No data available");

      tokenCacheRef.current = fresh;
      setTokens(fresh);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      if (tokenCacheRef.current.length === 0) {
        setError(err instanceof Error ? err.message : "Failed to fetch tokens");
        console.error("[wallst.fun] Scope error:", err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 30_000);
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
            <Flame className="w-9 h-9 text-orange-500" /> WallStSmith's Scope 👀
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={poll}
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
          &nbsp;·&nbsp;
          <span className="text-gains/70">
            sorted by trending rank · Birdeye · ≥$20K mcap only · auto-refreshes every 30s
          </span>
        </p>
      )}

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

                  {/* Liquidity Depth */}
                  <div className="bg-muted/20 p-3 rounded-lg border border-border/50">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                      Liquidity Depth
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
                    View on Birdeye
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
