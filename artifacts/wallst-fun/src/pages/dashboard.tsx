import React, { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { useLiveMetrics, useXFeed } from "@/hooks/use-simulated-data";
import { useScopeTokens } from "@/hooks/use-scope-data";
import { useWalletSolBalance, useRealTransactions } from "@/hooks/use-helius-data";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from "date-fns";
import { ArrowUpRight, ArrowDownRight, Wallet, Activity, Target, Zap, ExternalLink, Heart, Repeat2, MessageCircle, MessageSquare, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Dashboard() {
  const metrics = useLiveMetrics();
  const tweets = useXFeed();
  const { tokens: scopeTokens, loading: scopeLoading } = useScopeTokens(4);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  // Real blockchain data
  const { balance: solBalance, loading: solBalanceLoading } = useWalletSolBalance();
  const { trades: realTrades, totalTrades, winRate, loading: tradesLoading } = useRealTransactions();

  // Real SOL Price from CoinGecko API
  const [solPrice, setSolPrice] = useState(() => {
    // Load from localStorage on mount
    const cached = localStorage.getItem('wallst-sol-price');
    if (cached) {
      try {
        const { price } = JSON.parse(cached);
        return price || 0;
      } catch (e) {
        return 0;
      }
    }
    return 0;
  });
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    let retryTimeout: NodeJS.Timeout | null = null;

    const fetchPrice = async () => {
      try {
        console.log('[wallst.fun] Fetching SOL price from CoinGecko...');
        
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
        const data = await res.json();

        if (data.solana?.usd) {
          setSolPrice(data.solana.usd);
          setIsLive(true);
          console.log('[wallst.fun] SOL price updated:', data.solana.usd);
          // Update the ticker in RootLayout via localStorage
          localStorage.setItem('wallst-sol-price', JSON.stringify({ price: data.solana.usd, timestamp: Date.now() }));
        } else {
          throw new Error('Invalid price data');
        }
      } catch (error) {
        console.error('[wallst.fun] Failed to fetch SOL price:', error);
        setIsLive(false);
        // Retry once after 8 seconds on failure
        retryTimeout = setTimeout(() => {
          console.log('[wallst.fun] Retrying SOL price fetch...');
          fetchPrice();
        }, 8000);
      }
    };

    // Load cached price on mount
    const cached = localStorage.getItem('wallst-sol-price');
    if (cached) {
      try {
        const { price } = JSON.parse(cached);
        if (price) setSolPrice(price);
      } catch (e) {
        // Ignore parse errors
      }
    }

    fetchPrice();
    const interval = setInterval(fetchPrice, 60000); // every 60 seconds (well under 30 calls/min rate limit)

    return () => {
      clearInterval(interval);
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, []);

  // All-time performance chart: cumulative SOL P&L from real on-chain swaps
  const allTimeChartData = useMemo(() => {
    if (realTrades.length === 0) return [];
    const sorted = [...realTrades].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    let cumSol = 0;
    const points: { time: string; value: number }[] = [];
    sorted.forEach((trade) => {
      if (trade.action === "BUY") cumSol -= trade.solAmount;
      else if (trade.action === "SELL") cumSol += trade.solAmount;
      points.push({
        time: format(trade.timestamp, "MMM dd HH:mm"),
        value: parseFloat((cumSol * (solPrice || 0)).toFixed(2)),
      });
    });
    points.push({ time: format(new Date(), "MMM dd HH:mm"), value: parseFloat((cumSol * (solPrice || 0)).toFixed(2)) });
    return points;
  }, [realTrades, solPrice]);

  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address).then(() => {
      setCopiedAddress(address);
      setTimeout(() => setCopiedAddress(null), 1500);
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* HERO SECTION */}
      <section className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between bg-card border border-border p-6 rounded-2xl shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-20 -mt-20"></div>
        <div className="relative z-10 flex-1">
          <div className="flex items-center gap-3 mb-2">
            <Badge variant="outline" className="font-mono text-xs bg-background/50 backdrop-blur">Deployed</Badge>
            <LiveIndicator text="AUTONOMOUS MODE ACTIVE" />
          </div>
          <h1 className="text-3xl md:text-4xl font-serif font-bold text-foreground mt-2">
            WallStSmith
          </h1>
          <p className="text-muted-foreground mt-2 max-w-xl">
            An autonomous trading agent deployed to scan Solana liquidity pools, sentiment analysis, and viral trends to execute high-frequency algorithmic memecoin trades and document progress on X. No human intervention.
          </p>
        </div>
        
        <div className="relative z-10 bg-background/50 backdrop-blur-sm border border-border p-6 rounded-xl min-w-[280px]">
          <div className="text-sm font-medium text-muted-foreground flex items-center justify-between">
            CURRENT PORTFOLIO VALUE
            <Wallet className="w-4 h-4 text-primary" />
          </div>
          <div className="text-4xl font-bold mt-2 font-mono flex items-baseline gap-2">
            {solBalanceLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            ) : (
              (solBalance ?? 0).toFixed(4)
            )}
            <span className="text-lg text-muted-foreground font-sans">SOL</span>
          </div>
          <div className="text-xs text-gains font-mono mt-2 flex items-center gap-1">
            ● Helius Mainnet · live
          </div>
        </div>
      </section>

      {/* METRICS GRID */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Real SOL Price from CoinGecko API */}
        <div className="bg-card p-6 rounded-xl border border-border/50 hover:shadow-md transition-all duration-300">
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">SOL Price</p>
            <p className="text-3xl font-bold font-mono text-foreground">
              ${solPrice > 0 ? solPrice.toFixed(2) : '—'}
            </p>
            <p className={`text-xs font-medium ${isLive ? 'text-gains' : 'text-losses'}`}>
              ● CoinGecko • {isLive ? 'Live' : 'Last updated'}
            </p>
          </div>
        </div>

        {/* Win Rate */}
        <Card className="hover:shadow-md transition-all duration-300 border-border/50">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Win Rate</p>
                <p className="text-2xl font-bold font-mono">
                  {tradesLoading ? '—' : winRate !== null ? `${winRate.toFixed(1)}%` : '—'}
                </p>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Target className="w-5 h-5 text-primary" />
              </div>
            </div>
            <div className="text-xs mt-4 font-medium text-muted-foreground">
              {tradesLoading ? 'Loading...' : winRate !== null ? `${totalTrades} matched trades` : 'No matched trades yet'}
            </div>
          </CardContent>
        </Card>

        {/* Total Trades */}
        <Card className="hover:shadow-md transition-all duration-300 border-border/50">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Total Trades</p>
                <p className="text-2xl font-bold font-mono">
                  {tradesLoading ? '—' : totalTrades}
                </p>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Zap className="w-5 h-5 text-primary" />
              </div>
            </div>
            <div className="text-xs mt-4 font-medium text-gains">
              {tradesLoading ? 'Loading...' : `${totalTrades} swap${totalTrades !== 1 ? 's' : ''} on-chain`}
            </div>
          </CardContent>
        </Card>

        {/* Network Congestion */}
        <Card className="hover:shadow-md transition-all duration-300 border-border/50">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Network Congestion</p>
                <p className="text-2xl font-bold font-mono text-gains">Good</p>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Activity className="w-5 h-5 text-primary" />
              </div>
            </div>
            <div className="text-xs mt-4 font-medium text-muted-foreground">
              Solana Mainnet
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: P&L Chart & Trades */}
        <div className="lg:col-span-2 space-y-8">
          
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/50 bg-muted/20">
              <CardTitle className="text-lg font-serif">All Time Performance</CardTitle>
              <LiveIndicator />
            </CardHeader>
            <CardContent className="p-0 h-[300px]">
              {allTimeChartData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Activity className="w-8 h-8 opacity-30" />
                  <p className="text-sm font-medium">No trading history yet</p>
                  <p className="text-xs opacity-60">Chart will populate as the agent executes trades</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={allTimeChartData} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="time"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={50}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
                      domain={['dataMin - 10', 'dataMax + 10']}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                      itemStyle={{ color: 'hsl(var(--foreground))', fontWeight: 'bold' }}
                      formatter={(value: number) => [`$${value.toFixed(2)}`, 'P&L']}
                    />
                    <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/50 bg-muted/20">
              <CardTitle className="text-lg font-serif">Live Execution Log</CardTitle>
              <LiveIndicator text="HELIUS MAINNET" />
            </CardHeader>
            <div className="p-0 relative">
              {tradesLoading ? (
                <div className="flex items-center justify-center gap-3 py-10 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Fetching on-chain transactions...</span>
                </div>
              ) : realTrades.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                  <p className="text-sm">No swap transactions found on-chain yet.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="hover:bg-transparent border-border/50">
                      <TableHead className="w-[90px] text-xs">TIME</TableHead>
                      <TableHead className="w-[75px] text-xs">ACTION</TableHead>
                      <TableHead className="text-xs">ASSET</TableHead>
                      <TableHead className="text-right text-xs">SOL</TableHead>
                      <TableHead className="text-right text-xs">TX</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence>
                      {realTrades.slice(0, 8).map((trade) => (
                        <motion.tr
                          key={trade.id}
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="border-border/30 hover:bg-muted/20 transition-colors font-mono text-sm"
                        >
                          <TableCell className="text-muted-foreground text-xs">
                            {format(trade.timestamp, 'HH:mm:ss')}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                trade.action === 'BUY'
                                  ? 'bg-gains/10 text-gains border-gains/30'
                                  : trade.action === 'SELL'
                                  ? 'bg-losses/10 text-losses border-losses/30'
                                  : 'bg-primary/10 text-primary border-primary/30'
                              }`}
                            >
                              {trade.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-bold">{trade.tokenSymbol}</TableCell>
                          <TableCell className="text-right text-xs">
                            {trade.solAmount > 0 ? `${trade.solAmount.toFixed(3)}` : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <a
                              href={trade.txUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline text-[10px]"
                            >
                              {trade.shortSig} <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </TableCell>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              )}
            </div>
            <div className="p-3 border-t border-border/50 bg-muted/10 text-center">
              <span className="text-xs text-gains font-mono">● Live data from Helius Enhanced TX API · 30s refresh</span>
            </div>
          </Card>

        </div>

        {/* RIGHT COLUMN: X Feed & Trends */}
        <div className="space-y-8">
          
          <Card className="border-border/50 shadow-sm flex flex-col h-[400px]">
            <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/50 shrink-0">
              <CardTitle className="text-lg font-serif flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" /> Intelligence Feed
              </CardTitle>
              <LiveIndicator />
            </CardHeader>
            <CardContent className="p-4 overflow-hidden flex-1 relative">
              <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-card to-transparent z-10 pointer-events-none"></div>
              <div className="space-y-4 h-full">
                <AnimatePresence>
                  {tweets.map((tweet) => (
                    <motion.div 
                      key={tweet.id}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border-b border-border/50 pb-4 last:border-0"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary shrink-0">
                          W
                        </div>
                        <div className="space-y-1 w-full">
                          <div className="flex items-center justify-between">
                            <div className="flex items-baseline gap-1">
                              <span className="font-semibold text-sm">{tweet.name}</span>
                              <span className="text-xs text-muted-foreground">{tweet.handle}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">{format(tweet.timestamp, 'HH:mm')}</span>
                          </div>
                          <p className="text-sm text-foreground/90 leading-relaxed">{tweet.text}</p>
                          <div className="flex items-center gap-4 mt-2 text-muted-foreground text-xs font-mono">
                            <span className="flex items-center gap-1 hover:text-primary transition-colors cursor-pointer"><MessageCircle className="w-3 h-3" /> 0</span>
                            <span className="flex items-center gap-1 hover:text-gains transition-colors cursor-pointer"><Repeat2 className="w-3 h-3" /> {tweet.retweets}</span>
                            <span className="flex items-center gap-1 hover:text-losses transition-colors cursor-pointer"><Heart className="w-3 h-3" /> {tweet.likes}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm bg-gradient-to-br from-card to-muted/20">
            <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/50">
              <CardTitle className="text-lg font-serif">Scope</CardTitle>
              <LiveIndicator />
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/50">
                {scopeLoading ? (
                  <div className="p-6 flex items-center justify-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading tokens...
                  </div>
                ) : scopeTokens.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">No tokens found</div>
                ) : (
                  scopeTokens.map((token, i) => {
                    const shortAddr = token.tokenAddress.length > 8
                      ? `${token.tokenAddress.slice(0, 4)}...${token.tokenAddress.slice(-4)}`
                      : token.tokenAddress;
                    const isCopied = copiedAddress === token.tokenAddress;
                    return (
                      <div key={token.tokenAddress} className="p-3 hover:bg-muted/30 transition-colors flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-background border border-border flex items-center justify-center font-mono text-xs font-bold shadow-sm group-hover:border-primary/50 transition-colors shrink-0">
                            {i + 1}
                          </div>
                          <div>
                            <div className="font-bold flex items-center gap-1.5">
                              ${token.symbol}
                              {token.bondingProgress !== undefined && token.bondingProgress < 100 && (
                                <Badge variant="outline" className="text-[9px] h-4 px-1 text-muted-foreground border-border/50">bonding</Badge>
                              )}
                            </div>
                            <button
                              onClick={() => handleCopyAddress(token.tokenAddress)}
                              className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono hover:text-primary transition-colors mt-0.5"
                              title={token.tokenAddress}
                            >
                              {isCopied ? '✓ copied' : shortAddr}
                            </button>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono text-sm font-bold text-foreground">
                            {token.marketCap && token.marketCap > 0
                              ? `$${(token.marketCap / 1000).toFixed(0)}K`
                              : '—'}
                          </div>
                          <div className={`text-[10px] font-mono mt-0.5 font-medium ${!token.priceChange1m && token.priceChange1m !== 0 ? 'text-muted-foreground' : (token.priceChange1m ?? 0) >= 0 ? 'text-gains' : 'text-losses'}`}>
                            {!token.priceChange1m && token.priceChange1m !== 0
                              ? '1m: —'
                              : `1m: ${(token.priceChange1m ?? 0) >= 0 ? '+' : ''}${(token.priceChange1m ?? 0).toFixed(2)}%`}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="p-3 border-t border-border/50 bg-background/50 text-center">
                <Link href="/viral-trends" className="text-xs text-primary font-medium hover:underline flex items-center justify-center w-full gap-1">
                  View Full Scope <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
