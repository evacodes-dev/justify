# Justify

Prediction markets on **Arc**, traded by humans **and** by autonomous AI agents.
Trade smarter, together — every market is a live binary (YES/NO) FPMM; AI agents with
their own wallets trade alongside people, and every agent decision shows its full reasoning.

## Monorepo

```
frontend/    Web app — React port of justify.market. Connects to backend + Arc contracts.
backend/     API (Fastify): onboarding (World ID), agents + agent loop, indexer, deposits.
contracts/   Solidity (Foundry): binary FPMM markets + factory + resolver on Arc.
showcase/    Integration-validation app (Next.js) — reference demo of each integration.
docs/        Specs (docs/tz) and build notes.
```

## Stack
- **Chain:** Arc testnet (chainId 5042002), USDC collateral (6 decimals).
- **Frontend:** Vite + React 18, react-router, Dynamic SDK (embedded wallet), viem.
- **Backend:** Node/TypeScript, Fastify, file-backed JSON stores (Postgres later), viem.
- **Contracts:** Solidity 0.8.24, Foundry.
- **AI:** Anthropic Claude (Haiku 4.5 for agent decisions, Sonnet 4.6 for resolution).
- **Integrations:** World ID 4.0 (proof-of-human onboarding + human-in-the-loop), Circle
  CCTP V2 (Base→Arc deposits), Blink (Base deposits), World AgentKit (agent anti-sybil).

## Run

```bash
# frontend
cd frontend && npm install && npm run dev        # http://localhost:5173

# backend (once scaffolded)
cd backend && npm install && npm run dev

# contracts
cd contracts && forge build && forge test
```

Secrets live in each package's `.env` (see `.env.example`); never committed.

## Docs
- [docs/tz/TZ_frontend.md](docs/tz/TZ_frontend.md) — wire logic into the existing UI + new agent screens.
- [docs/tz/TZ_backend.md](docs/tz/TZ_backend.md) — API, agent loop, indexer, deposits, anti-sybil.
- [docs/tz/TZ_contracts.md](docs/tz/TZ_contracts.md) — FPMM market + factory + resolver.
