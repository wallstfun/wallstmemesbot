import { Router } from "express";
import { getCachedTweets } from "../lib/tweet-cache";

const router = Router();

router.get("/tweets", async (_req, res) => {
  try {
    const tweets = await getCachedTweets();
    res.json({ tweets, count: tweets.length, source: "scraper" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message, tweets: [] });
  }
});

export default router;
