import React, { useEffect, useRef } from "react";
import { useXFeedReal } from "@/hooks/use-x-feed";
import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare, MessageCircle, Repeat2, Heart, ExternalLink, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { LiveIndicator } from "@/components/ui/LiveIndicator";

function TwitterTimeline() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const render = () => {
      if ((window as any).twttr?.widgets) {
        (window as any).twttr.widgets.load(container);
      }
    };

    if (!(window as any).twttr) {
      const script = document.createElement("script");
      script.src = "https://platform.twitter.com/widgets.js";
      script.async = true;
      script.charset = "utf-8";
      script.onload = render;
      document.head.appendChild(script);
    } else {
      render();
    }
  }, []);

  return (
    <div ref={ref} className="w-full">
      <a
        className="twitter-timeline"
        data-theme="dark"
        data-tweet-limit="10"
        data-chrome="noheader nofooter noborders"
        href="https://twitter.com/WallstM99224"
      >
        Tweets by @WallstM99224
      </a>
    </div>
  );
}

export default function XFeedPage() {
  const { tweets, loading, error, lastRefresh, refetch } = useXFeedReal(15);

  const showEmbed = !loading && (error || tweets.length === 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-3xl mx-auto">
      <div className="flex items-center justify-between border-b border-border pb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-full">
            <MessageSquare className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">X Feed</h1>
            <p className="text-muted-foreground">
              Live posts from{" "}
              <a
                href="https://twitter.com/WallstM99224"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                @WallstM99224
              </a>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              Updated {formatDistanceToNow(lastRefresh, { addSuffix: true })}
            </span>
          )}
          <button
            onClick={refetch}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <LiveIndicator />
        </div>
      </div>

      {/* Loading state */}
      {loading && tweets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm">Loading tweets from @WallstM99224…</p>
        </div>
      )}

      {/* API not available — fall back to official Twitter embed */}
      {showEmbed && (
        <div className="space-y-4">
          {error && (
            <div className="flex items-start gap-3 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 text-sm">
              <AlertCircle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
              <p className="text-muted-foreground">
                Twitter API read access requires a Basic plan ($100/month). Showing the official
                Twitter timeline below.{" "}
                <button onClick={refetch} className="text-primary hover:underline">
                  Retry API
                </button>
              </p>
            </div>
          )}
          <Card className="border-border/50 overflow-hidden">
            <CardContent className="p-0">
              <TwitterTimeline />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Real tweets from API */}
      {tweets.length > 0 && (
        <div className="space-y-4 relative">
          <div className="absolute left-6 top-0 bottom-0 w-px bg-border -z-10" />
          <AnimatePresence>
            {tweets.map((tweet) => (
              <motion.div
                key={tweet.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="relative pl-14"
              >
                <div className="absolute left-[20px] top-6 w-3 h-3 rounded-full bg-card border-2 border-primary" />

                <Card className="border-border/50 shadow-sm hover:border-primary/30 transition-colors">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <img
                        src={`${import.meta.env.BASE_URL}images/agent-avatar.jpg`}
                        alt="WallStSmith"
                        className="w-12 h-12 rounded-full border border-primary/20 object-cover shrink-0"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                      <div className="w-full min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-1 gap-1">
                          <div className="flex items-baseline gap-2">
                            <span className="font-bold text-base text-foreground">{tweet.name}</span>
                            <span className="text-sm text-muted-foreground">{tweet.handle}</span>
                          </div>
                          <a
                            href={tweet.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 shrink-0"
                          >
                            {format(tweet.timestamp, "MMM dd, HH:mm")}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>

                        <p className="text-base text-foreground/90 mt-2 mb-4 leading-relaxed whitespace-pre-wrap break-words">
                          {tweet.text}
                        </p>

                        <div className="flex items-center gap-8 text-muted-foreground text-sm font-mono pt-4 border-t border-border/30">
                          <a href={tweet.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 hover:text-primary transition-colors group">
                            <div className="p-1.5 rounded-full group-hover:bg-primary/10"><MessageCircle className="w-4 h-4" /></div>
                            <span>{tweet.replies}</span>
                          </a>
                          <a href={tweet.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 hover:text-gains transition-colors group">
                            <div className="p-1.5 rounded-full group-hover:bg-gains/10"><Repeat2 className="w-4 h-4" /></div>
                            <span>{tweet.retweets}</span>
                          </a>
                          <a href={tweet.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 hover:text-losses transition-colors group">
                            <div className="p-1.5 rounded-full group-hover:bg-losses/10"><Heart className="w-4 h-4" /></div>
                            <span>{tweet.likes}</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
