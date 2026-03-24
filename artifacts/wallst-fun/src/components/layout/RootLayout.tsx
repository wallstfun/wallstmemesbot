import React, { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Moon, Sun, Terminal, Activity, Briefcase, MessageSquare, TrendingUp, User, Menu, X } from "lucide-react";
import { useLiveMetrics, useSolPrice } from "@/hooks/use-simulated-data";

// Replace with actual Solana wallet address (public-facing, masked)
export const WALLET_FULL = "Hw7yc27h6Lws6YsQmdLoj4M7psyFHRhosFwoGuSESmTh";
export const WALLET = "Hw7yc2...SESmTh";

const NavLink = ({ href, icon: Icon, children }: { href: string; icon: React.ElementType; children: React.ReactNode }) => {
  const [location] = useLocation();
  const isActive = location === href;
  
  return (
    <Link 
      href={href} 
      className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        isActive 
          ? "bg-primary/10 text-primary" 
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <Icon className="w-4 h-4" />
      {children}
    </Link>
  );
};

export function RootLayout({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("wallst-theme");
    return saved ? saved === "dark" : true;
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const metrics = useLiveMetrics();
  const { solPrice } = useSolPrice();

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("wallst-theme", isDark ? "dark" : "light");
  }, [isDark]);

  const toggleTheme = () => setIsDark(!isDark);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground transition-colors duration-300">
      {/* WSJ Style Ticker — single seamless scrolling line */}
      <div className="ticker-wrap bg-card border-b border-border h-8 text-xs font-mono select-none relative z-50">
        <div className="ticker">
          <span className="inline-flex items-center gap-8 px-8">
            <span className="font-bold">SYSTEM STATUS:&nbsp;<span className="text-gains">ONLINE</span></span>
            <span className="text-muted-foreground">///</span>
            <span>SOL/USD:&nbsp;<span className="font-bold">${solPrice.toFixed(2)}</span></span>
            <span className="text-muted-foreground">///</span>
            <span>AGENT BAL:&nbsp;<span className="font-bold">{metrics.solBalance.toFixed(2)} SOL</span></span>
            <span className="text-muted-foreground">///</span>
            <span>24H P&amp;L:&nbsp;<span className={`font-bold ${metrics.dailyPnl >= 0 ? "text-gains" : "text-losses"}`}>{metrics.dailyPnl >= 0 ? "+" : ""}{metrics.dailyPnl.toFixed(2)}%</span></span>
            <span className="text-muted-foreground">///</span>
            <span>WIN RATE:&nbsp;<span className="font-bold">{metrics.winRate.toFixed(1)}%</span></span>
            <span className="text-muted-foreground">///</span>
            <span>ACTIVE TRADES:&nbsp;<span className="font-bold">{metrics.totalTrades}</span></span>
            <span className="text-muted-foreground">///</span>
            <span className="font-bold text-muted-foreground">wallst.fun /// AgentSMITH</span>
            <span className="text-muted-foreground px-8">///</span>
          </span>
          {/* Duplicate for seamless infinite scroll loop */}
          <span className="inline-flex items-center gap-8 px-8">
            <span className="font-bold">SYSTEM STATUS:&nbsp;<span className="text-gains">ONLINE</span></span>
            <span className="text-muted-foreground">///</span>
            <span>SOL/USD:&nbsp;<span className="font-bold">${solPrice.toFixed(2)}</span></span>
            <span className="text-muted-foreground">///</span>
            <span>AGENT BAL:&nbsp;<span className="font-bold">{metrics.solBalance.toFixed(2)} SOL</span></span>
            <span className="text-muted-foreground">///</span>
            <span>24H P&amp;L:&nbsp;<span className={`font-bold ${metrics.dailyPnl >= 0 ? "text-gains" : "text-losses"}`}>{metrics.dailyPnl >= 0 ? "+" : ""}{metrics.dailyPnl.toFixed(2)}%</span></span>
            <span className="text-muted-foreground">///</span>
            <span>WIN RATE:&nbsp;<span className="font-bold">{metrics.winRate.toFixed(1)}%</span></span>
            <span className="text-muted-foreground">///</span>
            <span>ACTIVE TRADES:&nbsp;<span className="font-bold">{metrics.totalTrades}</span></span>
            <span className="text-muted-foreground">///</span>
            <span className="font-bold text-muted-foreground">wallst.fun /// AgentSMITH</span>
            <span className="text-muted-foreground px-8">///</span>
          </span>
        </div>
      </div>

      {/* Header — aligned with main content max-w-7xl */}
      <header className="sticky top-0 z-40 w-full glass-panel border-b">
        <div className="container mx-auto px-4 max-w-7xl h-16 flex items-center justify-between">
          <Link href="/" className="flex items-baseline gap-1 group">
            <span className="font-serif text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">wallst</span>
            <span className="font-sans text-xl font-medium text-muted-foreground">.fun</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            <NavLink href="/" icon={Activity}>Dashboard</NavLink>
            <NavLink href="/live-trades" icon={Terminal}>Live Trades</NavLink>
            <NavLink href="/portfolio" icon={Briefcase}>Portfolio</NavLink>
            <NavLink href="/viral-trends" icon={TrendingUp}>Viral Trends</NavLink>
            <NavLink href="/x-feed" icon={MessageSquare}>X Feed</NavLink>
            <NavLink href="/agent-bio" icon={User}>Agent Bio</NavLink>
          </nav>

          <div className="flex items-center gap-4">
            <button 
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            
            <button 
              className="md:hidden p-2 text-foreground"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-border bg-card absolute w-full left-0 top-16 shadow-lg">
            <nav className="flex flex-col p-4 space-y-2">
              <NavLink href="/" icon={Activity}>Dashboard</NavLink>
              <NavLink href="/live-trades" icon={Terminal}>Live Trades</NavLink>
              <NavLink href="/portfolio" icon={Briefcase}>Portfolio</NavLink>
              <NavLink href="/viral-trends" icon={TrendingUp}>Viral Trends</NavLink>
              <NavLink href="/x-feed" icon={MessageSquare}>X Feed</NavLink>
              <NavLink href="/agent-bio" icon={User}>Agent Bio</NavLink>
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card py-8 mt-auto">
        <div className="container mx-auto px-4 max-w-7xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-baseline gap-1 opacity-50 hover:opacity-100 transition-opacity">
            <span className="font-serif text-lg font-bold">wallst</span>
            <span className="font-sans text-md">.fun</span>
          </div>
          
          <div className="text-sm text-muted-foreground flex items-center gap-4 font-mono">
            <span>Agent Wallet: {WALLET}</span>
          </div>
          
          <div className="flex gap-4">
            <a href={`https://x.com/wallst_bot`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors"><MessageSquare className="w-5 h-5" /></a>
            <a href={`https://solscan.io/account/${WALLET_FULL}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors"><Terminal className="w-5 h-5" /></a>
          </div>
        </div>
      </footer>
    </div>
  );
}
