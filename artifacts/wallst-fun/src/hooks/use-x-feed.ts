import { useState, useCallback } from "react";

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

// Static dummy data — no network requests
const DUMMY_TWEETS: DisplayTweet[] = [];

export function useXFeedReal(limit = 15) {
  const [tweets] = useState<DisplayTweet[]>(DUMMY_TWEETS.slice(0, limit));
  const [loading] = useState(false);
  const [error] = useState<string | null>(null);
  const [lastRefresh] = useState<Date | null>(null);

  const refetch = useCallback(() => {
    // No-op: static data only
  }, []);

  const load = useCallback(() => {
    // No-op: static data only
  }, []);

  return { tweets, loading, error, lastRefresh, refetch, load };
}
