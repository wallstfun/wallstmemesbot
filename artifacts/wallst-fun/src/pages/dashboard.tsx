import React, { useState, useEffect } from "react";
import { useLiveMetrics, useLiveTrades, useChartData, useXFeed, useViralTrends } from "@/hooks/use-simulated-data";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from "date-fns";
import { ArrowUpRight, ArrowDownRight, Wallet, Activity, Target, Zap, ExternalLink, Heart, Repeat2, MessageCircle, MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Dashboard() {
  const metrics = useLiveMetrics();
  const trades = useLiveTrades(8);
  const chartData = useChartData(7);
  const tweets = useXFeed();
  const trends = useViralTrends();

  // Real SOL Price from Jupiter API
  const [solPrice, setSolPrice] = useState(145.20);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const url = 'https://price.jup.ag/v6/price?ids=SOL&api_key=429e13f2-25f8-4706-9326-24287fa313d4';
        console.log('[wallst.fun] Fetching real SOL price from Jupiter API...');

        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          cache: 'no-store'
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        const price = data.data?.SOL?.price;

        if (price && typeof price === 'number') {
          setSolPrice(price);
          setIsLive(true);
          console.log('[wallst.fun] SOL price updated successfully:', price);
        } else {
          throw new Error('Invalid price data');
        }
      } catch (error) {
        console.error('[wallst.fun] Failed to fetch SOL price from Jupiter:', error);
        setIsLive(false);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 15000);

    return () => clearInterval(interval);
  }, []);

  const isProfitable = metrics.dailyPnl >= 0;

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
            AgentSMITH
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
            {metrics.solBalance.toFixed(2)}
            <span className="text-lg text-muted-foreground font-sans">SOL</span>
          </div>
          <div className={`text-sm font-medium mt-2 flex items-center gap-1 ${isProfitable ? 'text-gains' : 'text-losses'}`}>
            {isProfitable ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
            {Math.abs(metrics.dailyPnlAbs).toFixed(2)} SOL ({Math.abs(metrics.dailyPnl).toFixed(2)}%) Today
          </div>
        </div>
      </section>

      {/* METRICS GRID */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Real SOL Price from Jupiter API */}
        <div className="bg-card p-6 rounded-xl border border-border/50 hover:shadow-md transition-all duration-300">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-muted-foreground">SOL Price</span>
            <span className={`text-xs font-medium ${isLive ? 'text-gains' : 'text-losses'}`}>
              ● Jupiter API • {isLive ? 'Live' : 'Fallback'}
            </span>
          </div>
          <div className="text-3xl font-bold font-mono text-foreground">
            ${solPrice.toFixed(2)}
          </div>
        </div>

        {[
          { title: "24H Win Rate", value: `${metrics.winRate.toFixed(1)}%`, icon: Target, trend: "Stable", neutral: false },
          { title: "Active Trades", value: metrics.totalTrades.toString(), icon: Zap, trend: "+12", neutral: false },
          { title: "Network Congestion", value: "Low", icon: Activity, trend: "400 TPS", neutral: true },
        ].map((m, i) => (
          <Card key={i} className="hover:shadow-md transition-all duration-300 border-border/50">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">{m.title}</p>
                  <p className="text-2xl font-bold font-mono">{m.value}</p>
                </div>
                <div className="p-2 bg-primary/10 rounded-lg">
                  <m.icon className="w-5 h-5 text-primary" />
                </div>
              </div>
              <div className={`text-xs mt-4 font-medium ${m.neutral ? 'text-muted-foreground' : 'text-gains'}`}>
                {m.trend}
              </div>
            </CardContent>
          </Card>
        ))}
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
              <LiveIndicator />
            </CardHeader>
            <div className="p-0 relative">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="w-[100px] text-xs">TIME</TableHead>
                    <TableHead className="w-[80px] text-xs">ACTION</TableHead>
                    <TableHead className="text-xs">ASSET</TableHead>
                    <TableHead className="text-right text-xs">SIZE (SOL)</TableHead>
                    <TableHead className="text-right text-xs">PNL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence>
                    {trades.slice(0, 8).map((trade) => (
                      <motion.tr 
                        key={trade.id}
                        initial={{ opacity: 0, y: -10, backgroundColor: 'hsl(var(--muted))' }}
                        animate={{ opacity: 1, y: 0, backgroundColor: 'transparent' }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="border-border/30 hover:bg-muted/20 transition-colors font-mono text-sm"
                      >
                        <TableCell className="text-muted-foreground">{format(trade.timestamp, 'HH:mm:ss')}</TableCell>
                        <TableCell>
                          <Badge variant={trade.action === 'BUY' ? 'default' : 'secondary'} className={`text-[10px] ${trade.action === 'BUY' ? 'bg-primary/20 text-primary hover:bg-primary/30' : 'bg-muted text-muted-foreground'}`}>
                            {trade.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-bold">${trade.token}</TableCell>
                        <TableCell className="text-right">{trade.amount.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          {trade.pnl ? (
                            <span className={trade.pnl > 0 ? "text-gains" : "text-losses"}>
                              {trade.pnl > 0 ? "+" : ""}{trade.pnlPercent?.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </div>
            <div className="p-3 border-t border-border/50 bg-muted/10 text-center">
              <span className="text-xs text-muted-foreground italic">Connect Helius RPC for mainnet execution.</span>
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
