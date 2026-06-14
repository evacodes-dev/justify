# Justify — submission notes

Copy-paste material for the hackathon submission form. See [README.md](README.md) for the
project overview and timeline, and [ARCHITECTURE.md](ARCHITECTURE.md) for the deep dive.

---

## One-liner
Prediction markets on Arc where humans **and** autonomous AI agents trade binary YES/NO
markets, resolved by a hybrid Chainlink + Claude oracle.

## Links
- **Repo:** https://github.com/evacodes-dev/justify
- **Commits:** https://github.com/evacodes-dev/justify/commits/main
- **Live demo:** https://88.198.118.236.nip.io
- **Arc explorer (factory):** https://testnet.arcscan.app/address/0xD32a1275698483aE883366E7a29aED9873416011

## Where each partner tech lives (git)
**World ID**
- RP signature + verify-proof — `backend/src/routes/compat.ts` (L136–165)
- Dev-bypass toggle `ALLOW_DEV_VERIFY` — `backend/src/routes/compat.ts` (L153)
- IDKit onboarding widget — `frontend/src/components/modals/OnboardingModal.tsx`
- Country-gate (`/api/can-bet/:id`) — `backend/src/routes/compat.ts`

**Arc**
- Chain config (chainId 5042002, native USDC) — `backend/src/chain.ts` (L6)
- FPMM contracts — `contracts/src/MarketFactory.sol`, `Market.sol`, `Resolver.sol`
- Deployed addresses — `contracts/deployments/arc-testnet.json`

**Chainlink**
- Data Feed reader — `backend/src/chainlink.ts`
- Hybrid resolver routing — `backend/src/resolution.ts`
- Live verifiable badge — `frontend/src/components/market/ChainlinkBadge.tsx`

**Circle CCTP**
- 2-hop burn/mint helpers — `backend/src/cctp-multi.ts`
- Deposit orchestrator — `backend/src/routes/deposit-bridge.ts`

**Blink / Swype**
- Server-side signer `/api/sign-payment` — `backend/src/routes/deposit.ts` (L47)
- `useBlinkDeposit` widget — `frontend/src/pages/DepositPage.tsx` (L28)

---

## "How it's made" (long form)

**Justify** is a prediction market on **Arc testnet** where humans *and* AI agents trade
binary YES/NO markets.

**Smart contracts (Foundry / Solidity 0.8.24):** Gnosis-style **FPMM** (constant-product)
markets with a `MarketFactory` and a conditional `Resolver`, collateralized by Arc's native
USDC (6-dec). Buys round *up* so the constant product `k` is non-decreasing — the pool can't
be drained by rounding.

**Backend (Fastify + TypeScript + viem):** file-backed JSON stores, a nonce-safe signer
queue (p-queue) for concurrent on-chain writes, and an incremental event indexer that
backfills Buy history to drive the price chart.

**Hybrid oracle — the part we're proud of.** Claude (Haiku 4.5) *classifies* each market:
price questions ("Will ETH close above $5k?") resolve deterministically from a real
**Chainlink Data Feed** (`latestRoundData` on Ethereum Sepolia), and we surface the live
price + a link to the exact aggregator on Etherscan so judges can verify it's a genuine
on-chain feed. Subjective questions fall through to **Claude (Sonnet 4.6)** for an
LLM-judged resolution with a written rationale. One router, two truth sources.

**Partner tech:** **Chainlink Data Feeds** (trustless price resolution), **World ID 4.0**
(proof-of-human gating + country-gated politics markets), **Circle CCTP V2** (Base→Arc
burn-and-mint deposits), **Blink/Swype** + **Dynamic** (embedded-wallet funding).

**Frontend:** React 18 + Vite + react-router, @tanstack/react-query for the live chart,
deployed on Hetzner behind nginx (static dist + `/api` proxy, HTTPS via nip.io + Let's
Encrypt).

**Hacky bits worth mentioning:** (1) CCTP `depositForBurn` kept reverting because the public
RPC returned a stale allowance right after approve — fixed with a MAX_UINT approve plus an
allowance re-read loop. (2) We normalize ISO alpha-2/alpha-3 country codes (`US` ⇄ `USA`) so
the World ID country-gate matches regardless of source.
