import React, { useState, useEffect } from "react";
import { useLiveMetrics, useChartData, useXFeed, useViralTrends } from "@/hooks/use-simulated-data";
import { useWalletSolBalance, useRealTransactions, useNetworkCongestion } from "@/hooks/use-helius-data";
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
  const chartData = useChartData(7);
  const tweets = useXFeed();
  const trends = useViralTrends();

  // Real blockchain data
  const { balance: solBalance, loading: solBalanceLoading } = useWalletSolBalance();
  const { trades: realTrades, totalTrades, winRate, loading: tradesLoading } = useRealTransactions();
  const { tps, congestion } = useNetworkCongestion();

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
                <p className={`text-2xl font-bold font-mono ${congestion === 'High' ? 'text-losses' : congestion === 'Medium' ? 'text-yellow-400' : 'text-gains'}`}>
                  {congestion}
                </p>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Activity className="w-5 h-5 text-primary" />
              </div>
            </div>
            <div className="text-xs mt-4 font-medium text-muted-foreground">
              {tps !== null ? `${tps.toLocaleString()} TPS` : 'Helius RPC · live'}
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: P&L Chart & Trades */}
        <div className="lg:col-span-2 space-y-8">
          
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/50 bg-muted/20">
              <CardTitle className="text-lg font-serif">Portfolio Performance (7D)</CardTitle>
              <LiveIndicator />
            </CardHeader>
            <CardContent className="p-0 h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
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
                    tickFormatter={(value) => `$${(value/1000).toFixed(1)}k`}
                    domain={['dataMin - 500', 'dataMax + 500']}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))', fontWeight: 'bold' }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Value']}
                  />
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
                </AreaChart>
              </ResponsiveContainer>
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
              <CardTitle className="text-lg font-serif">Viral Radar</CardTitle>
              <LiveIndicator />
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/50">
                {trends.slice(0,4).map((trend, i) => (
                  <div key={trend.id} className="p-4 hover:bg-muted/30 transition-colors flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-background border border-border flex items-center justify-center font-mono text-xs font-bold shadow-sm group-hover:border-primary/50 transition-colors">
                        {i+1}
                      </div>
                      <div>
                        <div className="font-bold flex items-center gap-2">
                          ${trend.symbol} 
                          <Badge variant="outline" className="text-[9px] h-4 px-1 text-muted-foreground border-border/50">new</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">Vol: {Math.floor(trend.volume24h)} SOL</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-mono text-sm font-bold ${trend.change24h >= 0 ? 'text-gains' : 'text-losses'}`}>
                        {trend.change24h >= 0 ? '+' : ''}{trend.change24h.toFixed(1)}%
                      </div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">{trend.views.toLocaleString()} views</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-3 border-t border-border/50 bg-background/50 text-center">
                <button className="text-xs text-primary font-medium hover:underline flex items-center justify-center w-full gap-1">
                  View Full Radar <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
