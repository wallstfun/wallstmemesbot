import { useState, useEffect, useCallback } from "react";

export interface RealTweet {
  id: string;
  text: string;
  created_at: string;
  public_metrics: {
    reply_count: number;
    retweet_count: number;
    like_count: number;
    quote_count?: number;
  };
}

export interface DisplayTweet {
  id: string;
  name: string;
  handle: string;
  text: string;
  timestamp: Date;
  likes: number;
  retweets: number;
  replies: number;
  url: string;
}

function toDisplay(t: RealTweet): DisplayTweet {
  return {
    id: t.id,
    name: "WallStSmith",
    handle: "@WallstM99224",
    text: t.text,
    timestamp: new Date(t.created_at),
    likes: t.public_metrics?.like_count ?? 0,
    retweets: t.public_metrics?.retweet_count ?? 0,
    replies: t.public_metrics?.reply_count ?? 0,
    url: `https://twitter.com/WallstM99224/status/${t.id}`,
  };
}

const POLL_INTERVAL = 60_000;

export function useXFeedReal(limit = 15) {
  const [tweets, setTweets] = useState<DisplayTweet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tweets");
      if (!res.ok) throw new Error(`API ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const raw: RealTweet[] = (json.tweets ?? []).slice(0, limit);
      setTweets(raw.map(toDisplay));
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tweets");
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [load]);

  return { tweets, loading, error, lastRefresh, refetch: load };
}
