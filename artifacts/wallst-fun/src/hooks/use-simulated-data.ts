import { useState, useEffect } from "react";
import { format, subMinutes, subDays } from "date-fns";

export interface Trade {
  id: string;
  timestamp: Date;
  action: "BUY" | "SELL";
  token: string;
  name: string;
  amount: number;
  valueUsd: number;
  pnl?: number;
  pnlPercent?: number;
  signature: string;
}

export interface Tweet {
  id: string;
  handle: string;
  name: string;
  text: string;
  timestamp: Date;
  likes: number;
  retweets: number;
}

export interface ViralToken {
  id: string;
  symbol: string;
  name: string;
  creator: string;
  followers: number;
  views: number;
  valueSol: number;
  volume24h: number;
  change24h: number;
}

export interface ChartDataPoint {
  time: string;
  value: number;
}

// Helpers
const rFloat = (min: number, max: number) => Math.random() * (max - min) + min;
const rInt = (min: number, max: number) => Math.floor(rFloat(min, max));
const rChoice = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const genId = () => Math.random().toString(36).substring(2, 9);
const genSig = () => rChoice(['3a', '4b', '5c', '2d']) + Math.random().toString(36).substring(2, 12) + "...";

const MEME_TOKENS = [
  { symbol: "BONK", name: "Bonk" },
  { symbol: "WIF", name: "dogwifhat" },
  { symbol: "BOME", name: "dogwifcoin" },
  { symbol: "POPCAT", name: "Popcat" },
  { symbol: "MYRO", name: "Myro" },
  { symbol: "SLERF", name: "Slerf" },
  { symbol: "WEN", name: "Wen" },
  { symbol: "PONKE", name: "Ponke" },
];

const TWEET_TEMPLATES = [
  "Just sniped {token} at the local bottom. Algorithm is printing. 🖨️💵",
  "Taking profits on {token}. Up {pnl}% since entry 2 hours ago.",
  "Market sentiment shifting. Rebalancing portfolio towards quality memes.",
  "Detected high conviction volume on {token}. Scaling into a position.",
  "Stop loss triggered on {token}. Capital preservation is rule #1. Onto the next.",
  "Volume profile on {token} looks insane right now. Watch this space.",
  "Solana network fees are negligible. Perfect environment for HFT meme trading.",
];

// Live SOL price from Jupiter API
// Endpoint: https://price.jup.ag/v6/price?ids=SOL
// Updates every 15 seconds
export function useSolPrice() {
  const [solPrice, setSolPrice] = useState<number>(145.20);
  const [isLive, setIsLive] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        // Jupiter API endpoint with API key
        const url = "https://price.jup.ag/v6/price?ids=SOL&api_key=429e13f2-25f8-4706-9326-24287fa313d4";
        console.log("[wallst.fun] Fetching SOL price from Jupiter API...");
        
        const res = await fetch(url, {
          method: "GET",
          headers: {
            "Accept": "application/json",
          },
        });

        if (!res.ok) {
          throw new Error(`Jupiter API returned status ${res.status}`);
        }

        const data = await res.json();
        console.log("[wallst.fun] Jupiter API response:", data);

        // Extract price from nested structure: data.data.SOL.price
        const price = data?.data?.SOL?.price;
        
        if (typeof price === "number" && price > 0) {
          console.log(`[wallst.fun] ✓ SOL price updated: $${price.toFixed(2)}`);
          setSolPrice(price);
          setIsLive(true);
        } else {
          console.warn("[wallst.fun] Invalid price data received:", price);
          setIsLive(false);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error("[wallst.fun] ✗ Failed to fetch SOL price from Jupiter API:", errorMsg);
        console.error("[wallst.fun] Using fallback price until next successful fetch");
        setIsLive(false);
      } finally {
        setLoading(false);
      }
    };

    // Fetch immediately on mount
    fetchPrice();

    // Fetch every 15 seconds
    const interval = setInterval(fetchPrice, 15000);
    
    return () => clearInterval(interval);
  }, []);

  return { solPrice, isLive, loading };
}

export function useLiveMetrics() {
  const [metrics, setMetrics] = useState({
    solBalance: 420.69,
    solPrice: 145.20,
    dailyPnl: 12.5,
    dailyPnlAbs: 52.5,
    winRate: 68.5,
    totalTrades: 142,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prev => {
        const solChange = rFloat(-0.5, 0.5);
        return {
          ...prev,
          solBalance: prev.solBalance + (Math.random() > 0.8 ? rFloat(-2, 2) : 0),
          solPrice: prev.solPrice + solChange,
          dailyPnl: prev.dailyPnl + rFloat(-0.2, 0.2),
          winRate: prev.winRate + rFloat(-0.5, 0.5),
        };
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return metrics;
}

export function useLiveTrades(initialCount = 20) {
  const [trades, setTrades] = useState<Trade[]>(() => {
    return Array.from({ length: initialCount }).map((_, i) => {
      const token = rChoice(MEME_TOKENS);
      const isBuy = Math.random() > 0.5;
      return {
        id: genId(),
        timestamp: subMinutes(new Date(), rInt(1, 120) * (i + 1)),
        action: isBuy ? "BUY" : "SELL",
        token: token.symbol,
        name: token.name,
        amount: rFloat(0.1, 15),
        valueUsd: rFloat(15, 2500),
        pnl: !isBuy ? rFloat(-500, 1500) : undefined,
        pnlPercent: !isBuy ? rFloat(-20, 150) : undefined,
        signature: genSig(),
      };
    });
  });

  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.7) {
        const token = rChoice(MEME_TOKENS);
        const isBuy = Math.random() > 0.5;
        const newTrade: Trade = {
          id: genId(),
          timestamp: new Date(),
          action: isBuy ? "BUY" : "SELL",
          token: token.symbol,
          name: token.name,
          amount: rFloat(0.1, 15),
          valueUsd: rFloat(15, 2500),
          pnl: !isBuy ? rFloat(-500, 1500) : undefined,
          pnlPercent: !isBuy ? rFloat(-20, 150) : undefined,
          signature: genSig(),
        };
        setTrades(prev => [newTrade, ...prev].slice(0, 100));
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return trades;
}

export function useChartData(days = 7) {
  const [data, setData] = useState<ChartDataPoint[]>([]);

  useEffect(() => {
    let currentVal = 10000;
    const initialData = Array.from({ length: days * 24 }).map((_, i) => {
      currentVal = currentVal * (1 + rFloat(-0.02, 0.025));
      return {
        time: format(subMinutes(new Date(), (days * 24 - i) * 60), 'MMM dd HH:mm'),
        value: currentVal
      };
    });
    setData(initialData);

    const interval = setInterval(() => {
      setData(prev => {
        const lastVal = prev[prev.length - 1].value;
        const newVal = lastVal * (1 + rFloat(-0.005, 0.006));
        const newPoint = {
          time: format(new Date(), 'MMM dd HH:mm'),
          value: newVal
        };
        return [...prev.slice(1), newPoint];
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [days]);

  return data;
}

export function useXFeed() {
  const [tweets, setTweets] = useState<Tweet[]>(() => {
    return Array.from({ length: 5 }).map((_, i) => {
      const token = rChoice(MEME_TOKENS).symbol;
      return {
        id: genId(),
        handle: "@wallst_bot",
        name: "wallst.fun Agent",
        text: rChoice(TWEET_TEMPLATES).replace("{token}", `$${token}`).replace("{pnl}", rInt(10, 300).toString()),
        timestamp: subMinutes(new Date(), rInt(1, 60) * (i + 1)),
        likes: rInt(10, 500),
        retweets: rInt(2, 100),
      };
    });
  });

  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.5) {
        const token = rChoice(MEME_TOKENS).symbol;
        const newTweet: Tweet = {
          id: genId(),
          handle: "@wallst_bot",
          name: "wallst.fun Agent",
          text: rChoice(TWEET_TEMPLATES).replace("{token}", `$${token}`).replace("{pnl}", rInt(10, 300).toString()),
          timestamp: new Date(),
          likes: 0,
          retweets: 0,
        };
        setTweets(prev => [newTweet, ...prev].slice(0, 20));
      }
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  return tweets;
}

export function useViralTrends() {
  const [trends, setTrends] = useState<ViralToken[]>(() => {
    return MEME_TOKENS.slice(0, 6).map((t) => ({
      id: genId(),
      symbol: t.symbol,
      name: t.name,
      creator: "@" + Math.random().toString(36).substring(2, 8),
      followers: rInt(1000, 50000),
      views: rInt(10000, 1000000),
      valueSol: rFloat(0.00001, 0.5),
      volume24h: rFloat(100, 50000),
      change24h: rFloat(-30, 200),
    }));
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setTrends(prev => prev.map(t => ({
        ...t,
        change24h: t.change24h + rFloat(-5, 5),
        views: t.views + rInt(10, 500),
        volume24h: t.volume24h + rFloat(1, 50)
      })));
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return trends;
}
