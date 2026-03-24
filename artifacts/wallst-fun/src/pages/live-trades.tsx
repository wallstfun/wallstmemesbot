import React from "react";
import { useLiveTrades } from "@/hooks/use-simulated-data";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { ExternalLink, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LiveTradesPage() {
  const trades = useLiveTrades(50); // Fetch more for the full page

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Live Execution Log</h1>
          <p className="text-muted-foreground mt-1">Unfiltered feed of all autonomous agent transactions.</p>
        </div>
        <div className="flex items-center gap-3 bg-card px-4 py-2 rounded-lg border border-border shadow-sm">
          <LiveIndicator text="CONNECTION: STABLE" />
        </div>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="flex flex-row justify-between items-center bg-muted/20 border-b border-border/50 pb-4">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs font-mono"><Filter className="w-3 h-3 mr-2" /> All Pairs</Button>
            <Button variant="outline" size="sm" className="h-8 text-xs font-mono">Buys Only</Button>
            <Button variant="outline" size="sm" className="h-8 text-xs font-mono">Sells Only</Button>
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            Showing last 50 transactions
          </div>
        </CardHeader>
        <CardContent className="p-0">
           <Table>
            <TableHeader className="bg-background sticky top-0 z-10 shadow-sm">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[150px]">TIMESTAMP (UTC)</TableHead>
                <TableHead className="w-[100px]">ACTION</TableHead>
                <TableHead>ASSET</TableHead>
                <TableHead className="text-right">SIZE (SOL)</TableHead>
                <TableHead className="text-right">VALUE (USD)</TableHead>
                <TableHead className="text-right">REALIZED PNL</TableHead>
                <TableHead className="text-right">TX SIGNATURE</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="font-mono text-sm">
              {trades.map((trade) => (
                <TableRow key={trade.id} className="border-border/40 hover:bg-muted/30 transition-colors">
                  <TableCell className="text-muted-foreground">
                    {format(trade.timestamp, 'yyyy-MM-dd HH:mm:ss')}
                  </TableCell>
                  <TableCell>
                    <Badge variant={trade.action === 'BUY' ? 'default' : 'secondary'} className={`text-[10px] ${trade.action === 'BUY' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {trade.action}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground">${trade.token}</span>
                      <span className="text-xs text-muted-foreground hidden sm:inline">{trade.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{trade.amount.toFixed(4)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">${trade.valueUsd.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    {trade.pnl ? (
                      <div className={trade.pnl > 0 ? "text-gains" : "text-losses"}>
                        <div>{trade.pnl > 0 ? "+" : ""}{trade.pnlPercent?.toFixed(2)}%</div>
                        <div className="text-xs opacity-70">${Math.abs(trade.pnl).toFixed(2)}</div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <a href="#" className="inline-flex items-center gap-1 text-primary hover:underline bg-primary/5 px-2 py-1 rounded">
                      {trade.signature} <ExternalLink className="w-3 h-3" />
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
