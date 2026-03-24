import React, { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Moon, Sun, Terminal, Activity, Briefcase, MessageSquare, TrendingUp, User, Menu, X } from "lucide-react";
import { useLiveMetrics } from "@/hooks/use-simulated-data";

export const WALLET = "6sYk2G...9qRzP";

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
  const [isDark, setIsDark] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const metrics = useLiveMetrics();

  useEffect(() => {
    // Enforce theme on mount
    const root = window.document.documentElement;
    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark(!isDark);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground transition-colors duration-300">
      {/* WSJ Style Ticker */}
      <div className="bg-card border-b border-border h-8 flex items-center overflow-hidden text-xs font-mono select-none relative z-50">
        <div className="flex w-[200%] ticker">
          <div className="flex items-center space-x-8 px-4 w-1/2 justify-around">
             <span className="font-bold">SYSTEM STATUS: <span className="text-gains">ONLINE</span></span>
             <span>SOL/USD: ${(metrics.solPrice).toFixed(2)}</span>
             <span>AGENT BAL: {metrics.solBalance.toFixed(2)} SOL</span>
             <span>24H P&L: <span className={metrics.dailyPnl >= 0 ? "text-gains" : "text-losses"}>{metrics.dailyPnl >= 0 ? "+" : ""}{metrics.dailyPnl.toFixed(2)}%</span></span>
             <span>WIN RATE: {metrics.winRate.toFixed(1)}%</span>
             <span>ACTIVE TRADES: {metrics.totalTrades}</span>
             <span className="font-bold text-muted-foreground">wallst.fun /// agent</span>
          </div>
          <div className="flex items-center space-x-8 px-4 w-1/2 justify-around">
             <span className="font-bold">SYSTEM STATUS: <span className="text-gains">ONLINE</span></span>
             <span>SOL/USD: ${(metrics.solPrice).toFixed(2)}</span>
             <span>AGENT BAL: {metrics.solBalance.toFixed(2)} SOL</span>
             <span>24H P&L: <span className={metrics.dailyPnl >= 0 ? "text-gains" : "text-losses"}>{metrics.dailyPnl >= 0 ? "+" : ""}{metrics.dailyPnl.toFixed(2)}%</span></span>
             <span>WIN RATE: {metrics.winRate.toFixed(1)}%</span>
             <span>ACTIVE TRADES: {metrics.totalTrades}</span>
             <span className="font-bold text-muted-foreground">wallst.fun /// agent</span>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 w-full glass-panel border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
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
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-baseline gap-1 opacity-50 hover:opacity-100 transition-opacity">
            <span className="font-serif text-lg font-bold">wallst</span>
            <span className="font-sans text-md">.fun</span>
          </div>
          
          <div className="text-sm text-muted-foreground flex items-center gap-4 font-mono">
            <span>Agent Wallet: {WALLET}</span>
            <span className="text-border">|</span>
            <span>Simulated Environment</span>
          </div>
          
          <div className="flex gap-4">
            <a href="#" className="text-muted-foreground hover:text-primary transition-colors"><MessageSquare className="w-5 h-5" /></a>
            <a href="#" className="text-muted-foreground hover:text-primary transition-colors"><Terminal className="w-5 h-5" /></a>
          </div>
        </div>
      </footer>
    </div>
  );
}
