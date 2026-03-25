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
  priceChange1m?: number;
  priceUsd?: number;
  bondingProgress?: number;
  url?: string;
}

const MORALIS_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjJkOWY2ZmM0LTczZGEtNDEwZC1iYjVlLTk1N2VlMjI4OGU3NCIsIm9yZ0lkIjoiNTA2OTQ1IiwidXNlcklkIjoiNTIxNjE0IiwidHlwZUlkIjoiNjE1MTFhYTYtMTk5ZS00OWVkLThiODktNTc2YjI1NGMxOTkwIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NzQzOTQxMTUsImV4cCI6NDkzMDE1NDExNX0.bPd42MqB0lwTbLivIX-4pFReN-F0LgB3rMplN-UsnHQ";

export default function ScopePage() {
  const [tokens, setTokens] = useState<PumpToken[]>([]);
  const previousMarketCaps = useRef<Record<string, number>>({});
  const allFetchedTokensRef = useRef<PumpToken[]>([]);
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
      const headers = {
        "X-API-Key": MORALIS_API_KEY,
        Accept: "application/json",
      };

      console.log("[wallst.fun] Fetching Pump.fun tokens from Moralis...");

      // Fetch bonding and graduated tokens in parallel
      const [bondingRes, graduatedRes] = await Promise.all([
        fetch("https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun/bonding?limit=50", { headers }),
        fetch("https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun/graduated?limit=50", { headers }),
      ]);

      if (!bondingRes.ok || !graduatedRes.ok) {
        throw new Error(`API error: ${bondingRes.status} / ${graduatedRes.status}`);
      }

      const bondingData = await bondingRes.json();
      const graduatedData = await graduatedRes.json();

      console.log("[wallst.fun] Bonding tokens:", bondingData.result?.length || 0);
      console.log("[wallst.fun] Graduated tokens:", graduatedData.result?.length || 0);

      // Combine results
      const allTokens: PumpToken[] = [];
      
      // Process bonding tokens
      if (bondingData.result && Array.isArray(bondingData.result)) {
        if (bondingData.result.length > 0) {
          console.log("[wallst.fun] Sample bonding token:", bondingData.result[0]);
        }
        bondingData.result.forEach((token: any) => {
          if (token.tokenAddress && token.symbol) {
            const marketCap = parseFloat(token.fullyDilutedValuation) || 0;
            
            allTokens.push({
              tokenAddress: token.tokenAddress,
              name: token.name || "Unknown",
              symbol: token.symbol,
              logo: token.logo,
              marketCap: marketCap,
              priceChange24h: 0,
              priceChange1m: NaN,
              priceUsd: parseFloat(token.priceUsd) || 0,
              bondingProgress: token.bondingCurveProgress || 0,
              url: `https://pump.fun/${token.tokenAddress}`,
            });
          }
        });
        console.log("[wallst.fun] Added bonding tokens:", allTokens.length);
      }

      // Process graduated tokens
      if (graduatedData.result && Array.isArray(graduatedData.result)) {
        if (graduatedData.result.length > 0) {
          console.log("[wallst.fun] Sample graduated token:", graduatedData.result[0]);
        }
        graduatedData.result.forEach((token: any) => {
          if (token.tokenAddress && token.symbol) {
            const marketCap = parseFloat(token.fullyDilutedValuation) || 0;
            
            allTokens.push({
              tokenAddress: token.tokenAddress,
              name: token.name || "Unknown",
              symbol: token.symbol,
              logo: token.logo,
              marketCap: marketCap,
              priceChange24h: 0,
              priceChange1m: NaN,
              priceUsd: parseFloat(token.priceUsd) || 0,
              bondingProgress: 100,
              url: `https://pump.fun/${token.tokenAddress}`,
            });
          }
        });
        console.log("[wallst.fun] Total after graduated:", allTokens.length);
      }

      // Sort by market cap (descending) and filter duplicates
      const uniqueTokens = Array.from(
        new Map(allTokens.map((token) => [token.tokenAddress, token])).values()
      ).sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));

      // Store all fetched tokens for replacement lookups
      allFetchedTokensRef.current = uniqueTokens;

      const topTokens = uniqueTokens.slice(0, 12);
      
      setTokens(topTokens);
      setLastUpdated(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error occurred";
      setError(message);
      console.error("[wallst.fun] Scope fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh every 45 seconds
  useEffect(() => {
    fetchTokens();
    const interval = setInterval(fetchTokens, 45000);
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

  // Calculate 1-minute market cap % change after every fetch
  useEffect(() => {
    if (tokens.length === 0) return;

    setTokens(prevTokens => {
      const updatedTokens = prevTokens.map(token => {
        const currentMC = token.marketCap || 0;
        const prevMC = previousMarketCaps.current[token.tokenAddress];

        let change = NaN;
        if (prevMC !== undefined && prevMC > 0) {
          change = ((currentMC - prevMC) / prevMC) * 100;
        }

        // Always update the previous market cap for next time
        previousMarketCaps.current[token.tokenAddress] = currentMC;

        return { ...token, priceChange1m: change };
      });

      // Track zero-change cycles and replace stale tokens
      updatedTokens.forEach(token => {
        const isZeroChange = Number.isNaN(token.priceChange1m) || 
                             (Math.abs(token.priceChange1m || 0) < 0.01);
        
        if (isZeroChange) {
          // Increment zero-change counter
          zeroChangeCountersRef.current[token.tokenAddress] = 
            (zeroChangeCountersRef.current[token.tokenAddress] || 0) + 1;
        } else {
          // Reset counter for non-zero change
          zeroChangeCountersRef.current[token.tokenAddress] = 0;
        }
      });

      // Check for tokens that need replacement (2 consecutive zero-change cycles)
      let tokensNeedingReplacement = false;
      const replacementMap = new Map<string, PumpToken>();

      updatedTokens.forEach(token => {
        const counter = zeroChangeCountersRef.current[token.tokenAddress] || 0;
        if (counter >= 2) {
          tokensNeedingReplacement = true;
          replacementMap.set(token.tokenAddress, token);
        }
      });

      if (tokensNeedingReplacement) {
        // Find replacement tokens from the full fetched list
        const topTokenAddresses = new Set(updatedTokens.map(t => t.tokenAddress));
        const replacementCandidates = allFetchedTokensRef.current.filter(
          token => !topTokenAddresses.has(token.tokenAddress)
        );

        // Sort candidates by strongest positive momentum
        replacementCandidates.sort((a, b) => {
          const changeA = a.priceChange1m || -Infinity;
          const changeB = b.priceChange1m || -Infinity;
          return changeB - changeA;
        });

        // Replace stale tokens with top candidates
        let replacementIndex = 0;
        const finalTokens = updatedTokens.map(token => {
          if (replacementMap.has(token.tokenAddress) && replacementIndex < replacementCandidates.length) {
            const replacement = replacementCandidates[replacementIndex];
            // Reset counter and previous market cap for new token
            zeroChangeCountersRef.current[replacement.tokenAddress] = 0;
            delete previousMarketCaps.current[replacement.tokenAddress];
            replacementIndex++;
            // Reset priceChange1m to NaN since it's the first cycle
            return { ...replacement, priceChange1m: NaN };
          }
          return token;
        });

        return finalTokens;
      }

      return updatedTokens;
    });
  }, [lastUpdated]); // Trigger after each fetch (lastUpdated changes once per fetch)

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
                    {/* Rank Badge with Gradient */}
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center font-serif text-lg font-bold text-white shadow-md">
                      #{index + 1}
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
                  {Number.isNaN(token.priceChange1m) ? (
                    <Badge variant="outline" className="bg-muted/10 text-muted-foreground font-semibold">
                      —
                    </Badge>
                  ) : (
                    <Badge
                      variant={token.priceChange1m >= 0 ? "default" : "destructive"}
                      className={
                        token.priceChange1m >= 0
                          ? "bg-gains/10 text-gains hover:bg-gains/20 font-semibold"
                          : "bg-losses/10 text-losses hover:bg-losses/20 font-semibold"
                      }
                    >
                      {token.priceChange1m >= 0 ? "+" : ""}
                      {token.priceChange1m.toFixed(2)}%
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
