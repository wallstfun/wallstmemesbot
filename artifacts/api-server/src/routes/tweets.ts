import { Router } from "express";

const router = Router();

const BEARER = process.env.X_BEARER_TOKEN ?? "";
const CACHE_TTL = 60_000;

let cachedUserId: string | null = null;
let cachedTweets: unknown[] = [];
let cacheExpiry = 0;

async function resolveUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const res = await fetch(
    "https://api.twitter.com/2/users/by/username/WallstM99224",
    { headers: { Authorization: `Bearer ${BEARER}` } },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Twitter user lookup ${res.status}: ${body}`);
  }
  const json: any = await res.json();
  if (!json.data?.id) throw new Error(json.errors?.[0]?.detail ?? "User not found");
  cachedUserId = json.data.id as string;
  return cachedUserId;
}

async function fetchTweets(userId: string): Promise<unknown[]> {
  const params = new URLSearchParams({
    max_results: "15",
    "tweet.fields": "created_at,public_metrics",
    expansions: "author_id",
    "user.fields": "profile_image_url,name,username",
  });
  const res = await fetch(
    `https://api.twitter.com/2/users/${userId}/tweets?${params}`,
    { headers: { Authorization: `Bearer ${BEARER}` } },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Twitter timeline ${res.status}: ${body}`);
  }
  const json: any = await res.json();
  return json.data ?? [];
}

router.get("/tweets", async (_req, res) => {
  if (!BEARER) {
    res.status(503).json({ error: "X_BEARER_TOKEN not configured" });
    return;
  }

  if (cachedTweets.length > 0 && Date.now() < cacheExpiry) {
    res.json({ tweets: cachedTweets, cached: true });
    return;
  }

  try {
    const userId = await resolveUserId();
    const tweets = await fetchTweets(userId);
    cachedTweets = tweets;
    cacheExpiry = Date.now() + CACHE_TTL;
    res.json({ tweets, cached: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (cachedTweets.length > 0) {
      res.json({ tweets: cachedTweets, cached: true, stale: true });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

export default router;
