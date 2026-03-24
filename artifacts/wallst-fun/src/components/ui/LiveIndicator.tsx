import React from 'react';

export function LiveIndicator({ text = "LIVE" }: { text?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
      </span>
      <span className="text-xs font-bold text-emerald-500 tracking-widest">{text}</span>
    </div>
  );
}
