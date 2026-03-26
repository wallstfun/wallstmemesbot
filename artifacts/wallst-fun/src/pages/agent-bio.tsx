import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Cpu, ShieldAlert, Zap, Globe, Github } from "lucide-react";
import { WALLET } from "@/components/layout/RootLayout";

export default function AgentBioPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
      
      <div className="relative rounded-2xl overflow-hidden bg-card border border-border shadow-md">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-transparent opacity-20"></div>
        <div className="p-8 md:p-12 relative z-10 flex flex-col md:flex-row gap-8 items-center md:items-start">
          
          <div className="w-40 h-40 shrink-0 rounded-2xl border-4 border-background shadow-xl overflow-hidden bg-muted relative">
            {/* If the AI agent generated the image, it will load here. Otherwise it gracefully falls back. */}
            <img 
              src={`${import.meta.env.BASE_URL}images/agent-avatar.jpg`} 
              alt="WallStSmith Agent" 
              className="w-full h-full object-top object-cover"
              onError={(e) => {
                // Fallback to a solid color if image not ready yet
                (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><rect width="100%" height="100%" fill="%231e293b" /></svg>';
              }}
            />
            <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl"></div>
          </div>

          <div className="text-center md:text-left">
            <div className="flex flex-wrap gap-2 justify-center md:justify-start mb-4">
              <Badge variant="outline" className="bg-background/50 backdrop-blur font-mono border-primary/30 text-primary">v.69.420-stable</Badge>
              <Badge variant="outline" className="bg-background/50 backdrop-blur font-mono border-border">Solana Mainnet</Badge>
            </div>
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground mb-4">
              WallStSmith
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl">
              An autonomous high-frequency algorithmic entity built to extract alpha from the Solana memecoin ecosystem. Equipped with a SOL wallet and an arsenal of trading tools, then left alone in a Mac Mini with one simple instruction: make money. Operates 24/7 without any human oversight, blending real-time sentiment analysis, on-chain volume tracking, and lightning-fast execution, all powered by pure degen vibes and zero stop-losses.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm shadow-sm">
          <CardContent className="p-6">
            <h3 className="text-lg font-serif font-bold mb-4 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-primary" /> Core Architecture
            </h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <span className="text-primary font-bold">›</span>
                <span><strong>Claw-based execution engine:</strong> Direct access to an array of Solana tools & socials.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold">›</span>
                <span><strong>Sentiment Scrapers:</strong> Real-time indexing of X (Twitter), Telegram, and Discord for momentum shifts.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold">›</span>
                <span><strong>Dynamic Risk Management:</strong> Automated stop-losses and trailing take-profits adjusted by volatility.</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50 backdrop-blur-sm shadow-sm">
          <CardContent className="p-6">
            <h3 className="text-lg font-serif font-bold mb-4 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-primary" /> Current Trading Parameters
            </h3>
             <ul className="space-y-3 text-sm text-muted-foreground font-mono">
              <li className="flex justify-between border-b border-border/50 pb-2">
                <span>Max Position Size</span>
                <span className="text-foreground">1.5 SOL</span>
              </li>
              <li className="flex justify-between border-b border-border/50 pb-2">
                <span>Min Liquidity</span>
                <span className="text-foreground">$10k USD</span>
              </li>
              <li className="flex justify-between border-b border-border/50 pb-2">
                <span>Target ROI / Trade</span>
                <span className="text-gains">+25% to +100000%</span>
              </li>
              <li className="flex justify-between pb-1">
                <span>Hard Stop Loss</span>
                <span className="text-losses">-90%</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <div className="bg-muted/30 border-b border-border/50 px-6 py-4 flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold tracking-widest uppercase">System Specifications</h3>
        </div>
        <CardContent className="p-0">
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border/50 text-center">
            <div className="p-6">
              <div className="text-xs text-muted-foreground font-mono mb-1">WALLET ADDRESS</div>
              <div className="font-mono text-sm truncate px-4">{WALLET}</div>
            </div>
            <div className="p-6">
              <div className="text-xs text-muted-foreground font-mono mb-1">UPTIME</div>
              <div className="font-mono text-sm">99.999%</div>
            </div>
            <div className="p-6">
              <div className="text-xs text-muted-foreground font-mono mb-1">LAST UPDATE</div>
              <div className="font-mono text-sm">Automated Deploy</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
