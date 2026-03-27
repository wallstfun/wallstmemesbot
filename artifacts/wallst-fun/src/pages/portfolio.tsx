import React, { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { RefreshCw, ExternalLink, AlertCircle, Loader2 } from "lucide-react";
import { useWalletSolBalance, useTokenHoldings, useRealTransactions, AGENT_WALLET } from "@/hooks/use-helius-data";

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "#8b5cf6",
  "#06b6d4",
  "#f59e0b",
  "#ec4899",
];

// Helper: Compute holdings from trade history
function computeDerivedHoldings(trades: any[]) {
  const holdings: Record<string, { tokenAmount: number; tokenSymbol: string; tokenMint: string }> = {};
  const sortedTrades = [...trades].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  for (const trade of sortedTrades) {
    if (trade.action === "BUY") {
      if (!holdings[trade.tokenMint]) {
        holdings[trade.tokenMint] = { tokenAmount: 0, tokenSymbol: trade.tokenSymbol, tokenMint: trade.tokenMint };
      }
      holdings[trade.tokenMint].tokenAmount += trade.tokenAmount;
    } else if (trade.action === "SELL") {
      if (holdings[trade.tokenMint]) {
        holdings[trade.tokenMint].tokenAmount -= trade.tokenAmount;
      }
    }
  }
  
  return Object.fromEntries(Object.entries(holdings).filter(([_, h]) => h.tokenAmount > 0));
}

// In-memory metadata cache (session-level)
const metadataCache = new Map<string, any>();

// Helper: Fetch token metadata with multiple fallbacks
async function fetchTokenMetadata(mint: string): Promise<any> {
  // Check cache first
  if (metadataCache.has(mint)) {
    console.log(`[metadata] Cache hit for ${mint}`);
    return metadataCache.get(mint);
  }

  let metadata = {
    symbol: mint.slice(0, 6).toUpperCase(),
    name: "Unknown Token",
    logoURI: undefined,
  };

  // Method 1: Try Jupiter single token endpoint
  try {
    console.log(`[metadata] Fetching from Jupiter /token/{mint} for ${mint}`);
    const res = await fetch(`https://tokens.jup.ag/token/${mint}`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      if (data.symbol || data.name || data.logoURI || data.icon) {
        metadata = {
          symbol: data.symbol || metadata.symbol,
          name: data.name || metadata.name,
          logoURI: data.logoURI || data.icon || undefined,
        };
        console.log(`[metadata] Jupiter success for ${mint}: logo=${metadata.logoURI ? "found" : "missing"}`);
        metadataCache.set(mint, metadata);
        return metadata;
      }
    }
  } catch (e) {
    console.log(`[metadata] Jupiter fetch failed for ${mint}:`, e instanceof Error ? e.message : String(e));
  }

  // Method 2: Try Jupiter full tokens list (for newer/meme tokens)
  try {
    console.log(`[metadata] Fetching from Jupiter tokens list for ${mint}`);
    const res = await fetch("https://tokens.jup.ag/tokens", { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const tokens = await res.json();
      const tokenData = Array.isArray(tokens) ? tokens.find((t: any) => t.address === mint || t.mint === mint) : tokens[mint];
      if (tokenData && (tokenData.symbol || tokenData.name || tokenData.logoURI || tokenData.icon)) {
        metadata = {
          symbol: tokenData.symbol || metadata.symbol,
          name: tokenData.name || metadata.name,
          logoURI: tokenData.logoURI || tokenData.icon || undefined,
        };
        console.log(`[metadata] Jupiter list success for ${mint}: logo=${metadata.logoURI ? "found" : "missing"}`);
        metadataCache.set(mint, metadata);
        return metadata;
      }
    }
  } catch (e) {
    console.log(`[metadata] Jupiter list fetch failed for ${mint}:`, e instanceof Error ? e.message : String(e));
  }

  // Method 3: Try searching in CoinGecko for newer tokens
  try {
    console.log(`[metadata] Fetching from CoinGecko for ${mint}`);
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/solana/contract/${mint}`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      if (data.image?.large || data.image?.small) {
        metadata.logoURI = data.image.large || data.image.small;
        console.log(`[metadata] CoinGecko success for ${mint}: logo found`);
        metadataCache.set(mint, metadata);
        return metadata;
      }
    }
  } catch (e) {
    console.log(`[metadata] CoinGecko fetch failed for ${mint}:`, e instanceof Error ? e.message : String(e));
  }

  // Method 4: Smart fallback - try common image URLs
  try {
    console.log(`[metadata] Trying smart fallback URLs for ${mint}`);
    const fallbackUrls = [
      `https://arweave.net/images/${mint}.png`,
      `https://bafybeiclsp2jcvqr5zihfvvhgfz5ijfzhdp7nstcb52q2vpj5bz5ybmea.ipfs.nftstorage.link/${mint}.png`,
      `https://metadata.solanium.io/images/${mint}.png`,
    ];
    
    for (const url of fallbackUrls) {
      try {
        const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          metadata.logoURI = url;
          console.log(`[metadata] Smart fallback found image at ${url} for ${mint}`);
          metadataCache.set(mint, metadata);
          return metadata;
        }
      } catch {}
    }
  } catch (e) {
    console.log(`[metadata] Smart fallback failed for ${mint}:`, e instanceof Error ? e.message : String(e));
  }

  console.log(`[metadata] Final fallback for ${mint}: no logo found, using default`);
  metadataCache.set(mint, metadata);
  return metadata;
}

// Helper: Fetch prices from Jupiter
async function fetchTokenPrices(mints: string[]): Promise<Record<string, number>> {
  if (mints.length === 0) return {};
  
  try {
    const res = await fetch(`https://price.jup.ag/v6/price?ids=${mints.join(",")}`);
    if (res.ok) {
      const data = await res.json();
      const prices: Record<string, number> = {};
      if (data.data) {
        Object.entries(data.data).forEach(([mint, info]: [string, any]) => {
          prices[mint] = parseFloat(info.price ?? "0");
        });
      }
      return prices;
    }
  } catch {}
  
  return {};
}

export default function PortfolioPage() {
  const { balance: solBalance, loading: solLoading, error: solError, refresh: refreshSol } = useWalletSolBalance();
  const { holdings, loading: holdingsLoading, error: holdingsError, refresh: refreshHoldings } = useTokenHoldings();
  const { trades, loading: tradesLoading } = useRealTransactions();
  const [enrichedHoldings, setEnrichedHoldings] = useState<any[]>([]);

  const refresh = () => { refreshSol(); refreshHoldings(); };

  // SOL price from CoinGecko (with localStorage cache shared with dashboard)
  const [solPrice, setSolPrice] = useState<number>(() => {
    try {
      const cached = localStorage.getItem("wallst-sol-price");
      if (cached) return JSON.parse(cached).price || 0;
    } catch {}
    return 0;
  });

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
        const data = await res.json();
        if (data.solana?.usd) {
          setSolPrice(data.solana.usd);
          localStorage.setItem("wallst-sol-price", JSON.stringify({ price: data.solana.usd }));
        }
      } catch {}
    };
    // Only fetch if no cached price
    if (!solPrice) fetchPrice();
  }, []);

  const solUsdValue = (solBalance ?? 0) * solPrice;

  // Merge API holdings with derived holdings from trades + enrich metadata
  useEffect(() => {
    const enrichHoldings = async () => {
      console.log('[portfolio] Holdings from API:', holdings);
      console.log('[portfolio] Trades from API:', trades);
      
      const derivedHoldings = computeDerivedHoldings(trades);
      console.log('[portfolio] Derived holdings:', derivedHoldings);
      
      // Start with API holdings
      let merged = [...holdings];
      
      // Add/merge derived holdings (excluding SOL, which we handle natively)
      const SOL_MINT = "So11111111111111111111111111111111111111112";
      Object.entries(derivedHoldings).forEach(([mint, derived]) => {
        // Skip native SOL in token holdings
        if (mint === SOL_MINT) return;
        
        const existing = merged.find(h => h.mint === mint);
        if (!existing) {
          // Add new token from derived
          merged.push({
            mint,
            symbol: derived.tokenSymbol,
            name: derived.tokenSymbol,
            balance: derived.tokenAmount,
            decimals: 0,
            logo: undefined,
            priceUsd: undefined,
            valueUsd: undefined,
          });
        }
      });
      
      // Filter out SOL from token holdings (deduplicate)
      merged = merged.filter(h => h.mint !== SOL_MINT);
      
      console.log('[portfolio] After deduplication:', merged);
      
      // Fetch metadata and prices for all tokens
      const mints = merged.map(h => h.mint);
      const [pricesResult, ...metadataResults] = await Promise.all([
        fetchTokenPrices(mints),
        ...mints.map(mint => fetchTokenMetadata(mint)),
      ]);
      
      // Enrich holdings with metadata and prices
      const enriched = merged.map((h, i) => {
        // Prefer original symbol from trade unless Jupiter returned a clearly superior name
        // (i.e., not a mint-based fallback like "4FSWEW")
        const metaSymbol = metadataResults[i]?.symbol;
        const isMetadataFallback = metaSymbol && /^[A-Z0-9]{6}$/.test(metaSymbol) && 
                                  metaSymbol === h.mint.slice(0, 6).toUpperCase();
        const symbol = !isMetadataFallback && metaSymbol ? metaSymbol : h.symbol;
        const logo = metadataResults[i]?.logoURI || h.logo;
        
        // Log detailed enrichment info for debugging
        if (logo) {
          console.log(`[portfolio] ${symbol} (${h.mint}): logo=${logo}`);
        } else {
          console.log(`[portfolio] ${symbol} (${h.mint}): NO LOGO FOUND`);
        }
        
        return {
          ...h,
          symbol,
          name: metadataResults[i]?.name || h.name,
          logo,
          priceUsd: pricesResult[h.mint] ?? undefined,
          valueUsd: (pricesResult[h.mint] ?? 0) > 0 ? h.balance * (pricesResult[h.mint] ?? 0) : undefined,
        };
      });
      
      console.log('[portfolio] Enriched holdings:', enriched);
      setEnrichedHoldings(enriched);
    };
    
    enrichHoldings();
  }, [holdings, trades]);

  const mergedHoldings = enrichedHoldings;

  // Build pie chart data from merged holdings + SOL
  const pieData = useMemo(() => {
    const data: { name: string; value: number; color: string }[] = [];

    const solUsd = (solBalance ?? 0) * solPrice;
    const tokenUsd = mergedHoldings.reduce((s, h) => s + (h.valueUsd ?? 0), 0);
    const grandTotal = solUsd + tokenUsd;

    if (grandTotal > 0) {
      if (solUsd > 0) {
        data.push({ name: "SOL", value: parseFloat(((solUsd / grandTotal) * 100).toFixed(1)), color: CHART_COLORS[0] });
      }
      mergedHoldings.filter(h => (h.valueUsd ?? 0) > 0).slice(0, 7).forEach((h, i) => {
        data.push({
          name: h.symbol,
          value: parseFloat(((h.valueUsd! / grandTotal) * 100).toFixed(1)),
          color: CHART_COLORS[(i + (solUsd > 0 ? 1 : 0)) % CHART_COLORS.length],
        });
      });
    } else if (mergedHoldings.length > 0) {
      // Fallback: show all holdings with equal visual weight (no USD value)
      mergedHoldings.slice(0, 8).forEach((h, i) => {
        data.push({ name: h.symbol, value: parseFloat(((1 / mergedHoldings.length) * 100).toFixed(1)), color: CHART_COLORS[i % CHART_COLORS.length] });
      });
    } else {
      data.push({ name: "SOL", value: 100, color: CHART_COLORS[0] });
    }

    return data;
  }, [mergedHoldings, solBalance, solPrice]);

  const totalUsdValue = useMemo(
    () => solUsdValue + mergedHoldings.reduce((s, h) => s + (h.valueUsd ?? 0), 0),
    [mergedHoldings, solUsdValue]
  );

  const isLoading = solLoading || holdingsLoading || tradesLoading;
  const hasError = solError || holdingsError;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Agent Portfolio</h1>
          <p className="text-muted-foreground mt-1">
            Live holdings from{" "}
            <a
              href={`https://solscan.io/account/${AGENT_WALLET}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-primary hover:underline"
            >
              {AGENT_WALLET}
            </a>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={refresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg hover:bg-muted/30 transition-colors text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <div className="text-right bg-card px-6 py-3 rounded-xl border border-border shadow-sm">
            <div className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">SOL Balance</div>
            {solLoading ? (
              <div className="flex items-center gap-2 mt-1">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground text-sm">Loading...</span>
              </div>
            ) : solError ? (
              <div className="text-losses text-sm font-mono mt-1">Error</div>
            ) : (
              <div className="text-2xl font-mono font-bold text-primary">
                {(solBalance ?? 0).toFixed(4)} SOL
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {hasError && (
        <div className="bg-losses/10 border border-losses/30 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-losses flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-losses">Failed to load some data</p>
            <p className="text-xs text-muted-foreground mt-0.5">{solError || holdingsError}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Pie Chart */}
        <Card className="lg:col-span-1 border-border/50">
          <CardHeader className="border-b border-border/50 bg-muted/10">
            <CardTitle className="text-lg font-serif">Allocation</CardTitle>
          </CardHeader>
          <CardContent className="p-6 flex flex-col items-center justify-center min-h-[300px]">
            {holdingsLoading ? (
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p className="text-sm">Fetching on-chain holdings...</p>
              </div>
            ) : pieData.length === 0 ? (
              <div className="text-center text-muted-foreground">
                <p className="text-sm">No token holdings found</p>
                <p className="text-xs mt-1">Wallet may have only SOL</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                      itemStyle={{ color: "hsl(var(--foreground))", fontWeight: "bold" }}
                      formatter={(value: number) => [`${value}%`, "Allocation"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-2 w-full mt-2">
                  {pieData.map((item) => (
                    <div key={item.name} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }}></div>
                      <span className="font-mono text-muted-foreground flex-1 truncate">{item.name}</span>
                      <span className="font-bold">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Assets Table */}
        <Card className="lg:col-span-2 border-border/50">
          <CardHeader className="border-b border-border/50 bg-muted/10 flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-serif">
              Assets
              {totalUsdValue > 0 && (
                <span className="ml-2 text-sm font-mono font-normal text-muted-foreground">
                  ≈ ${totalUsdValue.toFixed(2)} USD
                </span>
              )}
            </CardTitle>
            <span className="text-xs text-gains font-mono font-medium">● Live on-chain</span>
          </CardHeader>
          <CardContent className="p-0">
            {holdingsLoading ? (
              <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading token balances from Helius...</span>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>ASSET</TableHead>
                    <TableHead className="text-right">BALANCE</TableHead>
                    <TableHead className="text-right">VALUE (USD)</TableHead>
                    <TableHead className="text-right">PRICE</TableHead>
                    <TableHead className="text-right">SOLSCAN</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="font-mono">
                  {/* SOL native balance row */}
                  {!solLoading && (
                    <TableRow className="border-border/40 hover:bg-muted/20">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <img
                            src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
                            alt="SOL"
                            className="w-6 h-6 rounded-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                          <div>
                            <div className="font-bold font-sans">SOL</div>
                            <div className="text-[10px] text-muted-foreground font-sans">Solana</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{(solBalance ?? 0).toFixed(4)}</TableCell>
                      <TableCell className="text-right">
                        {solUsdValue > 0 ? `$${solUsdValue.toFixed(2)}` : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {solPrice > 0 ? `$${solPrice.toFixed(2)}` : <span>—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <a
                          href={`https://solscan.io/account/${AGENT_WALLET}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline bg-primary/5 px-2 py-1 rounded text-xs"
                        >
                          wallet <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </TableCell>
                    </TableRow>
                  )}
                  {mergedHoldings.map((asset) => (
                    <TableRow key={asset.mint} className="border-border/40 hover:bg-muted/20">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {asset.logo ? (
                            <img
                              src={asset.logo}
                              alt={asset.symbol}
                              className="w-6 h-6 rounded-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                              {asset.symbol[0]}
                            </div>
                          )}
                          <div>
                            <div className="font-bold font-sans">{asset.symbol}</div>
                            <div className="text-[10px] text-muted-foreground font-sans truncate max-w-[120px]">{asset.name}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {asset.balance >= 1000000
                          ? `${(asset.balance / 1000000).toFixed(2)}M`
                          : asset.balance >= 1000
                          ? `${(asset.balance / 1000).toFixed(2)}K`
                          : asset.balance.toFixed(asset.decimals > 4 ? 2 : asset.decimals)}
                      </TableCell>
                      <TableCell className="text-right">
                        {asset.valueUsd != null
                          ? `$${asset.valueUsd < 0.01 ? asset.valueUsd.toFixed(6) : asset.valueUsd.toFixed(2)}`
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {asset.priceUsd != null
                          ? `$${asset.priceUsd < 0.0001 ? asset.priceUsd.toExponential(2) : asset.priceUsd.toFixed(6)}`
                          : <span>—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <a
                          href={`https://solscan.io/token/${asset.mint}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline bg-primary/5 px-2 py-1 rounded text-xs"
                        >
                          {asset.mint.slice(0, 6)}... <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SOL Info Footer */}
      <div className="bg-card/50 border border-border/50 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-6">
          <div>
            <span className="text-muted-foreground text-xs uppercase tracking-wider">Native SOL</span>
            <div className="font-mono font-bold mt-0.5">
              {solBalance !== null ? `${solBalance.toFixed(4)} SOL` : "—"}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground text-xs uppercase tracking-wider">SPL Tokens</span>
            <div className="font-mono font-bold mt-0.5">{mergedHoldings.length}</div>
          </div>
          <div>
            <span className="text-muted-foreground text-xs uppercase tracking-wider">Token Portfolio USD</span>
            <div className="font-mono font-bold mt-0.5">
              {totalUsdValue > 0 ? `$${totalUsdValue.toFixed(2)}` : "—"}
            </div>
          </div>
        </div>
        <a
          href={`https://solscan.io/account/${AGENT_WALLET}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          View full wallet on Solscan <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
