import { Scraper } from "@the-convocation/twitter-scraper";
import { logger } from "./logger";

// Cookie-based auth is required for reliable access to new X accounts.
// To enable: add X_TWITTER_AUTH_TOKEN and X_TWITTER_CT0 as Replit secrets.
// Get these from your X browser session (DevTools → Application → Cookies → x.com).
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

const USERNAME = "WSSmith";
const MAX_TWEETS = 15;
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
// When scraper returns 0, wait this long before retrying to avoid storm
const EMPTY_RETRY_INTERVAL = 2 * 60 * 1000; // 2 minutes

let cache: CachedTweet[] = [];
let cacheTime = 0;
let fetching = false;
let usingCookies = false;

async function buildScraper(): Promise<Scraper> {
  const s = new Scraper();
  if (AUTH_TOKEN && CT0) {
    try {
      await s.setCookies([
        `auth_token=${AUTH_TOKEN}; Domain=.x.com; Path=/; Secure`,
        `ct0=${CT0}; Domain=.x.com; Path=/; Secure`,
      ]);
      usingCookies = true;
      logger.info("Twitter scraper: using cookie-based auth");
    } catch (err) {
      logger.warn({ err }, "Failed to set Twitter cookies, falling back to guest auth");
    }
  } else {
    logger.info("Twitter scraper: using guest auth (add X_TWITTER_AUTH_TOKEN + X_TWITTER_CT0 secrets for better access)");
  }
  return s;
}

let scraperPromise: Promise<Scraper> | null = null;

function getScraper(): Promise<Scraper> {
  if (!scraperPromise) {
    scraperPromise = buildScraper();
  }
  return scraperPromise;
}

async function fetchFromTwitter(): Promise<CachedTweet[]> {
  const scraper = await getScraper();
  const results: CachedTweet[] = [];

  for await (const tweet of scraper.getTweets(USERNAME, MAX_TWEETS)) {
    if (!tweet.id || !tweet.text) continue;
    // Include retweets if we have no other content
    results.push({
      id: tweet.id,
      text: tweet.isRetweet && tweet.retweetedStatus?.text
        ? `RT @${tweet.retweetedStatus.username ?? ""}: ${tweet.retweetedStatus.text}`
        : tweet.text,
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

  logger.info({ count: results.length, usingCookies }, "Tweet fetch completed");
  return results;
}

export async function getCachedTweets(forceRefresh = false): Promise<CachedTweet[]> {
  const now = Date.now();
  const ttl = cache.length > 0 ? REFRESH_INTERVAL : EMPTY_RETRY_INTERVAL;

  // Return cache if it is still fresh
  if (!forceRefresh && now - cacheTime < ttl) {
    return cache;
  }

  // Prevent concurrent fetches
  if (fetching) return cache;

  try {
    fetching = true;
    logger.info(`Fetching tweets from @${USERNAME}`);
    const fresh = await fetchFromTwitter();
    cache = fresh; // Accept even empty array — prevents re-fetch storm
    cacheTime = now;
    if (fresh.length > 0) {
      logger.info({ count: fresh.length }, "Tweet cache updated");
    }
  } catch (err) {
    logger.error({ err }, "Failed to fetch tweets");
    cacheTime = now; // Still advance time to prevent storm on errors
  } finally {
    fetching = false;
  }

  return cache;
}

export function startTweetRefresh(): void {
  getCachedTweets().catch(() => {});
  setInterval(() => getCachedTweets(true).catch(() => {}), REFRESH_INTERVAL);
}
