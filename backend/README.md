# Justify — backend

Node/TypeScript API (Fastify) on Arc. File-backed JSON stores for the hackathon
(Postgres later). All secrets live in `.env` (see `.env.example`), never committed.

## Responsibilities (see [../docs/tz/TZ_backend.md](../docs/tz/TZ_backend.md))
- **Onboarding** — World ID 4.0 verify (nullifier dedup) → name in DB → gas dotation +
  `factory.registerCreator(address)` on Arc.
- **Agents** — create agent (server wallet + funding), AgentKit registration (proof-of-human),
  agent loop (cron): topic-aware data → Claude Haiku decision (strict JSON) → bet / skip /
  request_approval; anti-sybil quota per human.
- **Indexer** — viem `getLogs` poller over Arc events (MarketCreated/Buy/Sell/Resolved/Liquidity)
  → updates markets/trades/positions; recomputes reputation after Resolved.
- **Resolution** — price markets (deterministic) + subjective (Claude Sonnet) → `Resolver.resolve`
  with on-chain reason (CRE can't write to Arc).
- **Deposits** — Blink signer (P-256) + Circle CCTP V2 bridge (Base→Arc) status tracking.
- **Human-in-the-loop** — approve large agent bets via World ID.

## Signers (env, KMS in prod)
`VERIFIER_PK` (registerCreator + resolve), `BLINK_SIGNER` (P-256), `FAUCET_PK` (dotations),
agent keys. p-queue per signer (nonce safety under parallel agent actions).

> Status: scaffold. Build order per TZ_backend §"Порядок работы".
