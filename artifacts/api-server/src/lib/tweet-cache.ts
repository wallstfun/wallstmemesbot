import { Scraper } from "@the-convocation/twitter-scraper";
import { logger } from "./logger";

// Optional: set X_TWITTER_AUTH_TOKEN and X_TWITTER_CT0 as secrets in Replit
// to enable cookie-based authentication for reliable access to new accounts.
// Get these from your X browser session cookies: auth_token and ct0.
const AUTH_TOKEN = process.env["X_TWITTER_AUTH_TOKEN"];
const CT0 = process.env["X_TWITTER_CT0"];

export interface CachedTweet {
  id: string;
  text: string;
  createdAt: string;
  likes: number;
  retweets: number;
  replies: number;
  views: number;
  url: string;
}

const USERNAME = "WallstM99224";
const MAX_TWEETS = 15;
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

let cache: CachedTweet[] = [];
let cacheTime = 0;
let fetching = false;

function buildScraper(): Scraper {
  const s = new Scraper();
  if (AUTH_TOKEN && CT0) {
    // Cookie-based auth — reliable even for brand-new accounts
    // Set auth_token and ct0 cookies from your X browser session
    s.setCookies([
      `auth_token=${AUTH_TOKEN}; Domain=.x.com; Path=/`,
      `ct0=${CT0}; Domain=.x.com; Path=/`,
    ]).catch(() => {});
  }
  return s;
}

const scraper = buildScraper();

async function fetchFromTwitter(): Promise<CachedTweet[]> {
  const results: CachedTweet[] = [];
  const iter = scraper.getTweets(USERNAME, MAX_TWEETS);

  for await (const tweet of iter) {
    if (!tweet.id || !tweet.text) continue;
    // Skip retweets
    if (tweet.isRetweet) continue;

    results.push({
      id: tweet.id,
      text: tweet.text,
      createdAt:
        tweet.timeParsed?.toISOString() ??
        new Date(Number(tweet.timestamp) * 1000).toISOString(),
      likes: tweet.likes ?? 0,
      retweets: tweet.retweets ?? 0,
      replies: tweet.replies ?? 0,
      views: (tweet.views as number) ?? 0,
      url:
        tweet.permanentUrl ??
        `https://twitter.com/${USERNAME}/status/${tweet.id}`,
    });
  }

  return results;
}

export async function getCachedTweets(forceRefresh = false): Promise<CachedTweet[]> {
  const now = Date.now();

  if (!forceRefresh && cache.length > 0 && now - cacheTime < REFRESH_INTERVAL) {
    return cache;
  }

  // If already mid-fetch, return stale data
  if (fetching) {
    return cache;
  }

  try {
    fetching = true;
    logger.info("Fetching tweets from @" + USERNAME);
    const fresh = await fetchFromTwitter();
    if (fresh.length > 0) {
      cache = fresh;
      cacheTime = now;
      logger.info({ count: fresh.length }, "Tweet cache updated");
    }
  } catch (err) {
    logger.error({ err }, "Failed to fetch tweets");
  } finally {
    fetching = false;
  }

  return cache;
}

export function startTweetRefresh(): void {
  // Warm the cache on startup (non-blocking)
  getCachedTweets().catch(() => {});

  // Refresh every 5 minutes
  setInterval(() => {
    getCachedTweets(true).catch(() => {});
  }, REFRESH_INTERVAL);
}
