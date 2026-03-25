/**
 * Standalone script: fetch latest tweets from @WallstM99224 and print to stdout.
 * Run with:  npx tsx scripts/fetch-wallst-tweets.ts
 */
import { Scraper } from "@the-convocation/twitter-scraper";
import fs from "node:fs/promises";
import path from "node:path";

const USERNAME = "WallstM99224";
const MAX_TWEETS = 15;
const OUT_FILE = path.resolve("data", "latest-tweets.json");

interface TweetRecord {
  id: string;
  text: string;
  createdAt: string;
  likes: number;
  retweets: number;
  replies: number;
  views: number;
  url: string;
}

async function main() {
  const scraper = new Scraper();
  const results: TweetRecord[] = [];

  console.log(`Fetching up to ${MAX_TWEETS} tweets from @${USERNAME}…`);

  for await (const tweet of scraper.getTweets(USERNAME, MAX_TWEETS)) {
    if (!tweet.id || !tweet.text || tweet.isRetweet) continue;
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

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(results, null, 2));

  console.log(`✓ ${results.length} tweets written to ${OUT_FILE}`);
  results.slice(0, 3).forEach((t) => {
    console.log(`  [${t.createdAt}] ${t.text.slice(0, 80)}…`);
  });
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
