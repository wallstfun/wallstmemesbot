import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { RefreshCw, ExternalLink, AlertCircle, Loader2 } from "lucide-react";
import { useWalletSolBalance, useTokenHoldings, AGENT_WALLET } from "@/hooks/use-helius-data";

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

export default function PortfolioPage() {
  const { balance: solBalance, loading: solLoading, error: solError, refresh: refreshSol } = useWalletSolBalance();
  const { holdings, loading: holdingsLoading, error: holdingsError, refresh: refreshHoldings } = useTokenHoldings();

  const refresh = () => { refreshSol(); refreshHoldings(); };

  // Build pie chart data from real holdings
  const pieData = useMemo(() => {
    const data: { name: string; value: number; color: string }[] = [];

    // Add SOL as first slice (use USD value if sol price known, else just percentage)
    // We'll compute relative percentages from USD values
    const solUsd = (solBalance ?? 0); // treat as placeholder; scaled below
    
    // Collect items with USD values
    const withUsd = holdings.filter(h => (h.valueUsd ?? 0) > 0);
    const withoutUsd = holdings.filter(h => !h.valueUsd || h.valueUsd <= 0);

    if (withUsd.length > 0 || solBalance) {
      // Use USD values for the pie
      const totalUsd = withUsd.reduce((s, h) => s + (h.valueUsd ?? 0), 0);
      // For SOL: we don't have usd value directly, so treat it proportionally
      // or show all tokens that have USD values
      if (withUsd.length > 0) {
        const grandTotal = totalUsd;
        withUsd.slice(0, 8).forEach((h, i) => {
          data.push({
            name: h.symbol,
            value: parseFloat(((h.valueUsd! / grandTotal) * 100).toFixed(1)),
            color: CHART_COLORS[i % CHART_COLORS.length],
          });
        });
      }
    }

    // Fallback: if no USD data, show by token balance count
    if (data.length === 0 && holdings.length > 0) {
      holdings.slice(0, 8).forEach((h, i) => {
        data.push({
          name: h.symbol,
          value: parseFloat(((1 / holdings.length) * 100).toFixed(1)),
          color: CHART_COLORS[i % CHART_COLORS.length],
        });
      });
    }

    // Fallback: only SOL
    if (data.length === 0 && solBalance !== null) {
      data.push({ name: "SOL", value: 100, color: CHART_COLORS[0] });
    }

    return data;
  }, [holdings, solBalance]);

  const totalUsdValue = useMemo(
    () => holdings.reduce((s, h) => s + (h.valueUsd ?? 0), 0),
    [holdings]
  );

  const isLoading = solLoading || holdingsLoading;
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
              {AGENT_WALLET.slice(0, 8)}...{AGENT_WALLET.slice(-6)}
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
            ) : holdings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                <p className="text-sm">No SPL token holdings found in this wallet.</p>
                <a
                  href={`https://solscan.io/account/${AGENT_WALLET}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary flex items-center gap-1 hover:underline"
                >
                  View on Solscan <ExternalLink className="w-3 h-3" />
                </a>
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
                  {holdings.map((asset) => (
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
            <div className="font-mono font-bold mt-0.5">{holdings.length}</div>
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
