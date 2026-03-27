let cachedUserId = null;
let cachedTweets = null;
let cacheExpiry = 0;

const CACHE_TTL = 60_000;

async function resolveUserId(token) {
  if (cachedUserId) return cachedUserId;
  const res = await fetch(
    "https://api.twitter.com/2/users/by/username/WallstM99224",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Twitter user lookup ${res.status}: ${body}`);
  }
  const json = await res.json();
  if (!json.data?.id) throw new Error(json.errors?.[0]?.detail ?? "User not found");
  cachedUserId = json.data.id;
  return cachedUserId;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30");

  const token = process.env.X_BEARER_TOKEN;
  if (!token) {
    return res.status(503).json({ error: "X_BEARER_TOKEN not configured" });
  }

  if (cachedTweets && cachedTweets.length > 0 && Date.now() < cacheExpiry) {
    return res.json({ tweets: cachedTweets, cached: true });
  }

  try {
    const userId = await resolveUserId(token);

    const params = new URLSearchParams({
      max_results: "15",
      "tweet.fields": "created_at,public_metrics",
      expansions: "author_id",
      "user.fields": "profile_image_url,name,username",
    });

    const tweetsRes = await fetch(
      `https://api.twitter.com/2/users/${userId}/tweets?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!tweetsRes.ok) {
      const body = await tweetsRes.text();
      throw new Error(`Twitter timeline ${tweetsRes.status}: ${body}`);
    }

    const json = await tweetsRes.json();
    cachedTweets = json.data ?? [];
    cacheExpiry = Date.now() + CACHE_TTL;

    return res.json({ tweets: cachedTweets, cached: false });
  } catch (err) {
    if (cachedTweets && cachedTweets.length > 0) {
      return res.json({ tweets: cachedTweets, cached: true, stale: true });
    }
    return res.status(500).json({ error: err.message });
  }
};
