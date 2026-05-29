# wallst.fun — Solana Trading Agent Dashboard

A real-time dashboard for monitoring a Solana memecoin trading agent. Built with React 19, TypeScript, and Vite, deployed as a Vercel SPA with serverless API backends.

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
| Routing | wouter |
| Charts | Recharts |
| UI Components | shadcn/ui (Radix-based) |
| Backend APIs | Vercel Serverless Functions (Node.js, Express 5) |
| Package Manager | pnpm |
| Monorepo | pnpm workspaces |

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/installation) (`npm install -g pnpm`)

## Getting Started

```bash
# Install dependencies
pnpm install

# Start dev server (port 3000)
pnpm --filter @workspace/wallst-fun run dev
```

### Build for production

```bash
pnpm --filter @workspace/wallst-fun run build
```

Output goes to `artifacts/wallst-fun/dist/`.

### Type check

```bash
pnpm --filter @workspace/wallst-fun run typecheck
```

## Project Structure

```
.
├── api/                      # Vercel serverless functions (production)
│   ├── tweets.js             # X/Twitter API proxy
│   ├── health.js             # Health check endpoint
│   └── ...                   # Simulated wallet endpoints
├── artifacts/
│   └── wallst-fun/           # Main dashboard application (React SPA)
│       ├── api/              # Vite dev API proxy handlers (mirrors api/)
│       ├── public/           # Static assets (favicon, images)
│       ├── src/
│       │   ├── components/   # UI components (shadcn/ui)
│       │   ├── hooks/        # Data fetching and state hooks
│       │   ├── pages/        # Route pages (wouter)
│       │   └── utils/        # Token metadata helpers
│       ├── index.html        # SPA entry point
│       └── vite.config.ts    # Vite build configuration
├── package.json              # Root workspace config
├── pnpm-workspace.yaml       # pnpm workspace definition
├── tsconfig.base.json        # Shared TypeScript config
└── vercel.json               # Vercel deployment config
```

### Pages

| Route | Page |
|---|---|
| `/` | Dashboard — P&L chart, metrics, latest trades |
| `/live-trades` | Live Trades — filterable swap history |
| `/portfolio` | Portfolio — token holdings + allocation chart |
| `/scope` | Scope — trending token discovery |
| `/x-feed` | X Feed — agent's Twitter posts |
| `/agent-bio` | Agent Bio — system specs and parameters |

## API Endpoints

The `api/` directory contains Vercel serverless functions. Wallet-specific endpoints (balance, holdings, transactions) return simulated data. The following endpoints are active:

- `GET /api/health` — Health check
- `POST /api/tweets` — Proxy for X/Twitter API (requires `X_BEARER_TOKEN` env var)

## Deployment

This project is designed to deploy on Vercel.

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

The build command and output directory are defined in `vercel.json`:
- Build: `pnpm --filter @workspace/wallst-fun run build`
- Output: `artifacts/wallst-fun/dist`

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `X_BEARER_TOKEN` | For X Feed | Twitter API bearer token for fetching agent tweets |

## License

MIT
