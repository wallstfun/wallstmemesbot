import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { useLiveMetrics } from "@/hooks/use-simulated-data";

const PORTFOLIO_DATA = [
  { name: 'SOL', value: 45.5, color: 'hsl(var(--primary))' },
  { name: 'BONK', value: 20.2, color: 'hsl(var(--chart-2))' },
  { name: 'WIF', value: 15.8, color: 'hsl(var(--chart-3))' },
  { name: 'POPCAT', value: 10.5, color: 'hsl(var(--chart-4))' },
  { name: 'OTHERS', value: 8.0, color: 'hsl(var(--chart-5))' },
];

export default function PortfolioPage() {
  const metrics = useLiveMetrics();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Agent Portfolio</h1>
          <p className="text-muted-foreground mt-1">Current holdings and asset allocation.</p>
        </div>
        <div className="text-right bg-card px-6 py-3 rounded-xl border border-border shadow-sm">
          <div className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Total Value</div>
          <div className="text-2xl font-mono font-bold text-primary">{metrics.solBalance.toFixed(2)} SOL</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <Card className="lg:col-span-1 border-border/50">
          <CardHeader className="border-b border-border/50 bg-muted/10">
            <CardTitle className="text-lg font-serif">Allocation</CardTitle>
          </CardHeader>
          <CardContent className="p-6 flex flex-col items-center justify-center min-h-[300px]">
             <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={PORTFOLIO_DATA}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {PORTFOLIO_DATA.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  itemStyle={{ color: 'hsl(var(--foreground))', fontWeight: 'bold' }}
                  formatter={(value: number) => [`${value}%`, 'Allocation']}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-4 w-full mt-4">
              {PORTFOLIO_DATA.map((item) => (
                <div key={item.name} className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                  <span className="font-mono text-muted-foreground flex-1">{item.name}</span>
                  <span className="font-bold">{item.value}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-border/50">
          <CardHeader className="border-b border-border/50 bg-muted/10">
            <CardTitle className="text-lg font-serif">Assets</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>ASSET</TableHead>
                  <TableHead className="text-right">BALANCE</TableHead>
                  <TableHead className="text-right">VALUE (SOL)</TableHead>
                  <TableHead className="text-right">AVG ENTRY</TableHead>
                  <TableHead className="text-right">UNREALIZED PNL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="font-mono">
                {PORTFOLIO_DATA.map((asset) => {
                  const valSol = (metrics.solBalance * (asset.value / 100));
                  const isPos = Math.random() > 0.4;
                  const pnl = (Math.random() * 45) * (isPos ? 1 : -1);
                  
                  return (
                    <TableRow key={asset.name} className="border-border/40 hover:bg-muted/20">
                      <TableCell className="font-bold font-sans">${asset.name}</TableCell>
                      <TableCell className="text-right">{(valSol * (asset.name === 'SOL' ? 1 : 15000)).toLocaleString(undefined, {maximumFractionDigits: 2})}</TableCell>
                      <TableCell className="text-right">{valSol.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {asset.name === 'SOL' ? '-' : `$${(Math.random() * 0.05).toFixed(4)}`}
                      </TableCell>
                      <TableCell className="text-right">
                        {asset.name === 'SOL' ? (
                           <span className="text-muted-foreground">-</span>
                        ) : (
                          <div className={isPos ? "text-gains" : "text-losses"}>
                            {isPos ? "+" : ""}{pnl.toFixed(2)}%
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
