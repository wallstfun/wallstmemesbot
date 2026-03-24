import React from "react";
import { useXFeed } from "@/hooks/use-simulated-data";
import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare, MessageCircle, Repeat2, Heart, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { LiveIndicator } from "@/components/ui/LiveIndicator";

export default function XFeedPage() {
  const tweets = useXFeed(); // In a real app we'd fetch a larger history here

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-3xl mx-auto">
      <div className="flex items-center justify-between border-b border-border pb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-full">
            <MessageSquare className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Agent Communications</h1>
            <p className="text-muted-foreground">Real-time broadcast from @WallstM99224</p>
          </div>
        </div>
        <LiveIndicator />
      </div>

      <div className="space-y-4 relative">
        <div className="absolute left-6 top-0 bottom-0 w-px bg-border -z-10"></div>
        <AnimatePresence>
          {tweets.map((tweet) => (
            <motion.div 
              key={tweet.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="relative pl-14"
            >
              <div className="absolute left-[20px] top-6 w-3 h-3 rounded-full bg-card border-2 border-primary"></div>
              
              <Card className="border-border/50 shadow-sm hover:border-primary/30 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <img 
                      src={`${import.meta.env.BASE_URL}images/agent-avatar.jpg`}
                      alt="WallStSmith"
                      className="w-12 h-12 rounded-full border border-primary/20 object-cover shrink-0"
                    />
                    <div className="w-full">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-1">
                        <div className="flex items-baseline gap-2">
                          <span className="font-bold text-base text-foreground">{tweet.name}</span>
                          <span className="text-sm text-muted-foreground">{tweet.handle}</span>
                        </div>
                        <a href="#" className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                          {format(tweet.timestamp, 'MMM dd, HH:mm')} <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      
                      <p className="text-base text-foreground/90 mt-2 mb-4 leading-relaxed whitespace-pre-wrap">
                        {tweet.text}
                      </p>
                      
                      <div className="flex items-center gap-8 text-muted-foreground text-sm font-mono pt-4 border-t border-border/30">
                        <button className="flex items-center gap-2 hover:text-primary transition-colors group">
                          <div className="p-1.5 rounded-full group-hover:bg-primary/10"><MessageCircle className="w-4 h-4" /></div>
                          <span>{Math.floor(Math.random() * 50)}</span>
                        </button>
                        <button className="flex items-center gap-2 hover:text-gains transition-colors group">
                          <div className="p-1.5 rounded-full group-hover:bg-gains/10"><Repeat2 className="w-4 h-4" /></div>
                          <span>{tweet.retweets}</span>
                        </button>
                        <button className="flex items-center gap-2 hover:text-losses transition-colors group">
                          <div className="p-1.5 rounded-full group-hover:bg-losses/10"><Heart className="w-4 h-4" /></div>
                          <span>{tweet.likes}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
