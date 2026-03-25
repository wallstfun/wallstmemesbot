import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function XFeedPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-3xl mx-auto">
      <div className="flex items-center justify-between border-b border-border pb-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-serif font-bold text-foreground">X Feed</h1>
          <p className="text-muted-foreground text-sm">
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

      <Card className="border-losses/30 bg-losses/5">
        <CardContent className="p-6 flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-losses flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-losses mb-2">X Feed Coming Soon</h3>
            <p className="text-sm text-muted-foreground">
              The X Feed feature will be restored soon with full integration to @WallstM99224's latest posts.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
