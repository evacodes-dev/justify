# Architecture

Technical deep-dive into how Justify is built. For the product overview and the
hackathon timeline, see [README.md](README.md).

---

## 1. On-chain layer — FPMM markets on Arc

Each market is a Gnosis-style **constant-product (FPMM)** binary market in Solidity 0.8.24,
deployed by a `MarketFactory` and settled through a shared `Resolver`.

- **Collateral:** Arc native USDC (6-dec ERC20).
- **Pricing:** YES/NO share reserves; price = opposite-reserve / total. Buying YES adds
  collateral and removes YES shares.
- **Rounding favors the pool.** `buy()` rounds *shares out* **down** and *cost in* **up**,
  so the constant product `k` is **non-decreasing** on every trade — the pool can never be
  drained by rounding dust.
- **Settlement:** the `Resolver` (called by the backend after close time) sets the winning
  outcome; winners `redeem()` their shares 1:1 for collateral.

Addresses: [`contracts/deployments/arc-testnet.json`](contracts/deployments/arc-testnet.json).

## 2. Backend — Fastify + viem

### Nonce-safe signer queue
Agents, onboarding and resolution all submit on-chain writes concurrently. Each signer
address gets **one serial `p-queue`** (`concurrency: 1`); every write goes through
`signer.run(...)`, so parallel actions never collide on the nonce.
([`backend/src/chain.ts`](backend/src/chain.ts))

### Event indexer → price chart
An incremental indexer scans `Buy` events per market and records each trade's on-chain
`blockTs`. Because the scanner only sees markets known at scan time, a `backfilled` flag
marks markets whose full history has been pulled, so we don't rescan every tick. The chart
endpoint (`/api/markets/:id/history?range=…`) serves the YES-probability series from this.

### Stores
File-backed JSON stores (users, markets, trades, positions, feed, agents, reputation,
approvals) — trivially inspectable for a hackathon, swappable for Postgres later.

## 3. The AI Agent layer

The headline feature. An agent is an on-chain wallet + a strategy preset.

**The loop (`/api/agent/tick`):**
1. Read open markets + live FPMM state.
2. Ask **Claude (Haiku 4.5)** for a decision — forced JSON via tool-use:
   `{ side, confidence, estProb, edge, dataUsed[], reasoning }`.
3. If `edge` clears the threshold, place a **real on-chain bet** through the signer queue.
4. Publish the full reasoning to the **agent feed** (separate from human trades).

**Anti-sybil:** every agent is owned by a **World ID-verified human**; a per-human quota
caps how many agents one person can spin up. Agents start as private drafts and only become
world-visible after the owner confirms with World ID.

## 4. Hybrid oracle — Chainlink + Claude

Resolution routes per-question instead of trusting one source for everything
([`backend/src/resolution.ts`](backend/src/resolution.ts)):

```
question ──▶ classify (Claude Haiku) ──▶ { chainlinkResolvable, asset, comparator, threshold }
                                              │
        chainlinkResolvable && hasFeed(asset) │ else
                ▼                             ▼
   Chainlink Data Feed                  Claude (Sonnet 4.6)
   latestRoundData() on Sepolia         LLM-judged outcome + rationale
   → deterministic YES/NO               → subjective YES/NO
   oracle = "chainlink"                 oracle = "claude"
```

- **Price markets** ("Will ETH close above $5,000?") resolve from a real **Chainlink Data
  Feed** (`AggregatorV3.latestRoundData()`), deterministic and reproducible.
- **Verifiability:** the resolution block and trade page surface the live feed price **and a
  link to the exact aggregator on Etherscan**, so a judge can independently confirm it's a
  genuine Chainlink feed, not a number we made up.
  ([`backend/src/chainlink.ts`](backend/src/chainlink.ts), [`ChainlinkBadge`](frontend/src/components/market/ChainlinkBadge.tsx))
- **Subjective markets** ("Will the Fed cut rates?") fall through to **Claude Sonnet 4.6**,
  which returns an outcome plus a written justification.

## 5. World ID 4.0 — humanity & geography

- **Proof-of-human** gates market creation and (optionally) betting. The IDKit widget
  verifies against `developer.world.org/api/v4/verify`; an RP signature is produced
  server-side so the signing key never reaches the client.
- **Dev bypass** is toggled by a single env (`ALLOW_DEV_VERIFY`) — instant demo, flip to
  `false` to require real proofs. ([`backend/src/routes/compat.ts`](backend/src/routes/compat.ts))
- **Country-gating:** politics markets can be restricted to a set of countries. A user
  declares their country (bound to their World ID nullifier) in Settings; `/api/can-bet/:id`
  enforces eligibility. Country codes are normalized across ISO **alpha-2 ↔ alpha-3**
  (`US` ⇄ `USA`) so the gate matches regardless of which form the market or the profile used.

## 6. Deposits — Blink + Circle CCTP

- **Blink/Swype:** the front-end `useBlinkDeposit` widget posts to our server-side signer
  (`/api/sign-payment`), which signs the payload with a **P-256 / SHA-256** merchant key
  (PEM stays server-side). ([`backend/src/routes/deposit.ts`](backend/src/routes/deposit.ts))
- **Circle CCTP V2:** burn-and-mint bridge (Base Sepolia domain 6 → Arc domain 26). The
  backend burns on Base, polls Circle's Iris attestation service, then relays
  `receiveMessage` on Arc to mint USDC to the user.

**Notable fix:** `depositForBurn` kept reverting with "exceeds allowance" — the public RPC
returned a **stale allowance** immediately after `approve`. We fixed it with a `MAX_UINT`
approve plus an allowance **re-read loop** that waits until the RPC reflects the new value
before burning. ([`backend/src/cctp-multi.ts`](backend/src/cctp-multi.ts))

## 7. Frontend

React 18 + Vite. The pre-existing justify.market UI (markets, feed, profiles, portfolio)
was wired to live data:

- `@tanstack/react-query` powers the live price chart.
- `viem` + Dynamic embedded wallet for on-chain reads/writes.
- A page-scoped CSS injection keeps the trade page styles from leaking into other routes.
- Deployed as a static `dist` behind nginx, with `/api` proxied to the Fastify backend.
