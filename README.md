# wallst.fun — Solana Trading Agent Dashboard

A real-time dashboard for monitoring a Solana memecoin trading agent. Built with React, TypeScript, and Vite.

## Features

- **Dashboard** — Agent P&L, SOL balance, win rate, trade history, and live execution log
- **Live Trades** — Filterable swap history with token metadata enrichment
- **Portfolio** — Token holdings breakdown with USD value and allocation chart
- **Scope** — Trending token discovery via DexScreener with market cap, volume, and price tracking
- **X Feed** — Agent's latest posts from X/Twitter
- **Agent Bio** — System architecture and trading parameters

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7, Tailwind CSS v4, Framer Motion |
| Data Fetching | TanStack React Query |
| Charts | Recharts |
| UI Components | shadcn/ui (Radix-based) |
| Backend APIs | Vercel Serverless Functions (Node.js) |
| Package Manager | pnpm |
| Monorepo | pnpm workspaces |

## Getting Started

```bash
pnpm install
pnpm --filter @workspace/wallst-fun run dev
```

The dev server starts on port 3000.

## Project Structure

```
artifacts/wallst-fun/     # Main dashboard application (React SPA)
├── api/                  # Vite dev API proxy handlers
├── src/
│   ├── components/       # UI components (shadcn/ui)
│   ├── hooks/            # Data fetching and state hooks
│   ├── pages/            # Route pages
│   └── utils/            # Token metadata helpers
api/                      # Vercel serverless functions
├── tweets.js             # X/Twitter API proxy
├── health.js             # Health check
└── ...                   # Wallet-related endpoints (simulated)
```

## Deployment

Deployed via Vercel. The SPA is built with Vite and served from `artifacts/wallst-fun/dist`.

```bash
vercel --prod
```

## License

MIT
