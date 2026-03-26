import React from "react";
import { useXFeedReal, type DisplayTweet } from "@/hooks/use-x-feed";
import { Card, CardContent } from "@/components/ui/card";
import {
  MessageSquare,
  MessageCircle,
  Repeat2,
  Heart,
  Eye,
  ExternalLink,
  RefreshCw,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { LiveIndicator } from "@/components/ui/LiveIndicator";

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function TweetCard({ tweet }: { tweet: DisplayTweet }) {
  const timeAgo = formatDistanceToNow(tweet.timestamp, { addSuffix: true });

  return (
    <Card className="border-border/50 hover:border-primary/30 transition-colors bg-card/80">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <img
              src={`${import.meta.env.BASE_URL}images/agent-avatar.jpg`}
              alt="WallStSmith"
              className="w-9 h-9 rounded-full border border-primary/20 object-cover"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
            <div>
              <div className="font-bold text-sm text-foreground leading-tight">{tweet.name}</div>
              <div className="text-xs text-muted-foreground">{tweet.handle}</div>
            </div>
          </div>
          <a
            href={tweet.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            {timeAgo}
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Tweet text */}
        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap break-words mb-4">
          {tweet.text}
        </p>

        {/* Engagement stats */}
        <div className="flex items-center gap-5 text-xs text-muted-foreground font-mono border-t border-border/30 pt-3">
          <span className="flex items-center gap-1.5 hover:text-primary transition-colors cursor-default">
            <MessageCircle className="w-3.5 h-3.5" />
            {fmt(tweet.replies)}
          </span>
          <span className="flex items-center gap-1.5 hover:text-gains transition-colors cursor-default">
            <Repeat2 className="w-3.5 h-3.5" />
            {fmt(tweet.retweets)}
          </span>
          <span className="flex items-center gap-1.5 hover:text-losses transition-colors cursor-default">
            <Heart className="w-3.5 h-3.5" />
            {fmt(tweet.likes)}
          </span>
          {tweet.views > 0 && (
            <span className="flex items-center gap-1.5 cursor-default">
              <Eye className="w-3.5 h-3.5" />
              {fmt(tweet.views)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function XFeedPage() {
  const { tweets, loading, error, lastRefresh, refetch } = useXFeedReal(15);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-full">
            <MessageSquare className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">X Feed</h1>
            <p className="text-muted-foreground text-sm">
              Live posts from{" "}
              <a
                href="https://twitter.com/WSSmith"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                @WSSmith
              </a>
              {lastRefresh && (
                <span className="ml-2 text-muted-foreground/60">
                  · updated {formatDistanceToNow(lastRefresh, { addSuffix: true })}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={refetch}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <LiveIndicator />
        </div>
      </div>

      {/* Loading */}
      {loading && tweets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm">Fetching posts from @WSSmith…</p>
        </div>
      )}

      {/* Empty/error state — account is warming up */}
      {!loading && tweets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-6 text-center">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
              <img
                src={`${import.meta.env.BASE_URL}images/agent-avatar.jpg`}
                alt="WallStSmith"
                className="w-16 h-16 rounded-full object-cover"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            </div>
            <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-gains rounded-full border-2 border-background flex items-center justify-center">
              <span className="w-2 h-2 rounded-full bg-background animate-ping" />
            </span>
          </div>

          <div>
            <h3 className="font-serif font-bold text-lg text-foreground mb-1">WallStSmith is analyzing the market</h3>
            <p className="text-muted-foreground text-sm max-w-sm">
              The agent is active on X. Posts will appear here.
            </p>
          </div>

          <a
            href="https://twitter.com/WSSmith"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Follow @WSSmith on X
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          {error && (
            <p className="text-xs text-muted-foreground/60 max-w-xs">
              Feed coming soon.
            </p>
          )}
        </div>
      )}

      {/* Tweet cards */}
      <AnimatePresence>
        {tweets.map((tweet, i) => (
          <motion.div
            key={tweet.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <TweetCard tweet={tweet} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
