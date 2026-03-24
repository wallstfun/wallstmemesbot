import React from "react";
import { useViralTrends } from "@/hooks/use-simulated-data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flame, Eye, TrendingUp, Users } from "lucide-react";
import { LiveIndicator } from "@/components/ui/LiveIndicator";

export default function ViralTrendsPage() {
  const trends = useViralTrends();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-3">
            <Flame className="w-8 h-8 text-orange-500" /> Viral Radar
          </h1>
          <p className="text-muted-foreground mt-1">Algorithms scraping social consensus and liquidity momentum.</p>
        </div>
        <div className="bg-card px-4 py-2 rounded-lg border border-border shadow-sm">
           <LiveIndicator text="SCANNING WEB3" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {trends.map((trend, index) => (
          <Card key={trend.id} className="border-border/50 hover:border-primary/50 transition-all duration-300 shadow-sm group bg-gradient-to-b from-card to-background">
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center font-serif text-lg font-bold shadow-sm">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="font-bold text-xl">${trend.symbol}</h3>
                    <p className="text-xs text-muted-foreground">{trend.name}</p>
                  </div>
                </div>
                <Badge variant={trend.change24h >= 0 ? "default" : "destructive"} className={trend.change24h >= 0 ? 'bg-gains/10 text-gains hover:bg-gains/20' : 'bg-losses/10 text-losses hover:bg-losses/20'}>
                  {trend.change24h >= 0 ? '+' : ''}{trend.change24h.toFixed(1)}%
                </Badge>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 bg-muted/20 p-3 rounded-lg border border-border/50">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1 mb-1">
                       <TrendingUp className="w-3 h-3" /> 24h Vol (SOL)
                    </div>
                    <div className="font-mono text-sm font-bold">{trend.volume24h.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1 mb-1">
                      Value (SOL)
                    </div>
                    <div className="font-mono text-sm font-bold">{trend.valueSol.toFixed(5)}</div>
                  </div>
                </div>

                <div className="pt-2 border-t border-border/50 flex justify-between items-center text-sm">
                   <div className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors cursor-help">
                     <Users className="w-4 h-4" />
                     <span className="font-mono">{trend.creator}</span>
                   </div>
                   <div className="flex items-center gap-1 text-muted-foreground font-mono">
                     <Eye className="w-4 h-4" />
                     {(trend.views / 1000).toFixed(1)}k
                   </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
