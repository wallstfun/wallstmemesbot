import React, { useEffect, useRef } from "react";
import { MessageSquare } from "lucide-react";
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
      const existing = document.querySelector('script[src*="platform.twitter.com/widgets.js"]');
      if (!existing) {
        const script = document.createElement("script");
        script.src = "https://platform.twitter.com/widgets.js";
        script.async = true;
        script.charset = "utf-8";
        script.onload = render;
        document.head.appendChild(script);
      } else {
        // Script exists but hasn't loaded yet — poll
        const poll = setInterval(() => {
          if ((window as any).twttr?.widgets) {
            clearInterval(poll);
            render();
          }
        }, 200);
        return () => clearInterval(poll);
      }
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
        data-dnt="true"
        href="https://twitter.com/WallstM99224"
      >
        Tweets by @WallstM99224
      </a>
    </div>
  );
}

export default function XFeedPage() {
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
        <LiveIndicator />
      </div>

      <TwitterTimeline />
    </div>
  );
}
