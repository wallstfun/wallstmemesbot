import React, { useState, useEffect, useMemo } from "react";
import { useRealTransactions, AGENT_WALLET } from "@/hooks/use-helius-data";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink, Filter, RefreshCw, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchTokenMetadata } from "@/utils/token-metadata";

// Format timestamp in UTC
function formatUTC(date: Date): string {
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

// Generate short signature for TX column
function getShortSig(fullSig: string): string {
  if (!fullSig) return "—";
  return fullSig.slice(0, 8) + "…" + fullSig.slice(-4);
}

type FilterType = "all" | "buy" | "sell" | "swap";

// Trade with enriched metadata
interface EnrichedTrade {
  [key: string]: any;
  enrichedSymbol: string;
  enrichedName: string;
}

export default function LiveTradesPage() {
  const { trades, loading, error, refresh } = useRealTransactions();
  const [filter, setFilter] = useState<FilterType>("all");
  const [enrichedTrades, setEnrichedTrades] = useState<EnrichedTrade[]>([]);

  // Enrich trades with token metadata
  useEffect(() => {
    const enrichTrades = async () => {
      const unique_mints = [...new Set(trades.filter(t => t.tokenMint).map(t => t.tokenMint))];
      console.log(`[live-trades] Enriching ${unique_mints.length} unique token mints (including SOL)...`);
      
      const metadata: Record<string, any> = {};
      for (const mint of unique_mints) {
        try {
          const meta = await fetchTokenMetadata(mint);
          metadata[mint] = meta;
          console.log(`[live-trades] Resolved ${mint} to ${meta.symbol} (${meta.name})`);
        } catch (e) {
          console.log(`[live-trades] Failed to enrich ${mint}:`, e);
        }
      }
      
      // Enrich each trade
      const enriched = trades.map(t => {
        const meta = metadata[t.tokenMint];
        return {
          ...t,
          enrichedSymbol: meta?.symbol || t.tokenSymbol || "???",
          enrichedName: meta?.name || t.description || "Unknown",
          logo: meta?.logoURI,
        };
      });
      
      setEnrichedTrades(enriched);
    };
    
    if (trades.length > 0) {
      enrichTrades();
    }
  }, [trades]);

  const filtered = enrichedTrades
    .filter((t) => {
      if (filter === "all") return true;
      if (filter === "buy") return t.action === "BUY";
      if (filter === "sell") return t.action === "SELL";
      if (filter === "swap") return t.action === "SWAP";
      return true;
    })
    .slice(-20); // Show only last 20 recent trades

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Live Execution Log</h1>
          <p className="text-muted-foreground mt-1">
            Real on-chain swap history for{" "}
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
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg hover:bg-muted/30 transition-colors text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <div className="flex items-center gap-3 bg-card px-4 py-2 rounded-lg border border-border shadow-sm">
            <LiveIndicator text="HELIUS MAINNET" />
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-losses/10 border border-losses/30 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-losses shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-losses">Failed to fetch transaction history</p>
            <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
          </div>
        </div>
      )}

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="flex flex-row justify-between items-center bg-muted/20 border-b border-border/50 pb-4">
          <div className="flex gap-2">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs font-mono"
              onClick={() => setFilter("all")}
            >
              <Filter className="w-3 h-3 mr-2" /> All Swaps
            </Button>
            <Button
              variant={filter === "buy" ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs font-mono"
              onClick={() => setFilter("buy")}
            >
              Buys Only
            </Button>
            <Button
              variant={filter === "sell" ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs font-mono"
              onClick={() => setFilter("sell")}
            >
              Sells Only
            </Button>
            <Button
              variant={filter === "swap" ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs font-mono"
              onClick={() => setFilter("swap")}
            >
              Token→Token
            </Button>
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            {loading ? "Fetching..." : `${filtered.length} of ${enrichedTrades.length} transactions (latest 20)`}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <div className="text-center">
                <p className="text-sm font-medium">Fetching on-chain transactions...</p>
                <p className="text-xs mt-1">Querying Helius Enhanced Transaction API</p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
              <p className="text-sm font-medium">No swap transactions found.</p>
              <p className="text-xs">
                {filter !== "all"
                  ? "Try a different filter."
                  : "This wallet has no recorded DEX swaps yet."}
              </p>
              <a
                href={`https://solscan.io/account/${AGENT_WALLET}#transactions`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                View all transactions on Solscan <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-background sticky top-0 z-10 shadow-sm">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[160px]">TIMESTAMP (UTC)</TableHead>
                  <TableHead className="w-[90px]">ACTION</TableHead>
                  <TableHead>ASSET</TableHead>
                  <TableHead className="text-right">TOKEN AMOUNT</TableHead>
                  <TableHead className="text-right">TX</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="font-mono text-sm">
                {filtered.map((trade) => (
                  <TableRow
                    key={trade.id}
                    className="border-border/40 hover:bg-muted/30 transition-colors"
                  >
                    <TableCell className="text-muted-foreground text-xs">
                      {formatUTC(trade.timestamp)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          trade.action === "BUY"
                            ? "bg-gains/15 text-gains border-gains/30 text-[10px]"
                            : trade.action === "SELL"
                            ? "bg-losses/15 text-losses border-losses/30 text-[10px]"
                            : "bg-primary/15 text-primary border-primary/30 text-[10px]"
                        }
                        variant="outline"
                      >
                        {trade.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <div className="relative w-4 h-4 flex-shrink-0">
                            {trade.logo && (
                              <img
                                src={trade.logo}
                                alt={trade.enrichedSymbol || trade.tokenSymbol}
                                className="w-4 h-4 rounded-full object-cover"
                                onError={(e) => { e.currentTarget.style.display = "none"; }}
                              />
                            )}
                            {!trade.logo && (
                              <div className="w-4 h-4 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-[8px] font-bold text-primary/70">
                                {(trade.enrichedSymbol || trade.tokenSymbol || "?").charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <span className="font-bold text-foreground">{trade.enrichedSymbol || trade.tokenSymbol || "SOL"}</span>
                        </div>
                        {trade.enrichedSymbol !== "SOL" && trade.enrichedName && (
                          <span className="text-[10px] text-muted-foreground truncate max-w-[140px]" title={trade.enrichedName}>
                            {trade.enrichedName.slice(0, 50) + (trade.enrichedName.length > 50 ? "..." : "")}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {trade.tokenAmount > 0 ? (
                        trade.tokenAmount >= 1000000
                          ? `${(trade.tokenAmount / 1000000).toFixed(2)}M ${trade.enrichedSymbol || trade.tokenSymbol}`
                          : trade.tokenAmount >= 1000
                          ? `${(trade.tokenAmount / 1000).toFixed(2)}K ${trade.enrichedSymbol || trade.tokenSymbol}`
                          : `${trade.tokenAmount.toFixed(2)} ${trade.enrichedSymbol || trade.tokenSymbol}`
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {trade.signature && trade.txUrl ? (
                        <a
                          href={trade.txUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline bg-primary/5 px-2 py-1 rounded text-xs font-mono"
                        >
                          {trade.shortSig || getShortSig(trade.signature)} <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="text-center text-xs text-muted-foreground">
        Data sourced from{" "}
        <span className="text-primary font-medium">Helius Enhanced Transaction API</span>
      </div>
    </div>
  );
}
// Rebuild: Fri Mar 27 07:23:24 AM UTC 2026
