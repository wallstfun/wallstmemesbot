import { useState, useEffect, useCallback } from "react";

export interface DisplayTweet {
  id: string;
  text: string;
  createdAt: string;
  timestamp: Date;
  likes: number;
  retweets: number;
  replies: number;
  views: number;
  url: string;
  name: string;
  handle: string;
}

const POLL_INTERVAL = 60_000; // 1 minute

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
      if (json.error && (!json.tweets || json.tweets.length === 0)) throw new Error(json.error);

      const raw: any[] = (json.tweets ?? []).slice(0, limit);
      setTweets(
        raw.map((t) => ({
          id: t.id,
          text: t.text,
          createdAt: t.createdAt,
          timestamp: new Date(t.createdAt),
          likes: t.likes ?? 0,
          retweets: t.retweets ?? 0,
          replies: t.replies ?? 0,
          views: t.views ?? 0,
          url: t.url ?? `https://twitter.com/WallstM99224/status/${t.id}`,
          name: "WallStSmith",
          handle: "@WallstM99224",
        })),
      );
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
