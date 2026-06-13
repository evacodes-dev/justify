# Justify — contracts

Solidity 0.8.24 (Foundry), deployed to Arc testnet (chainId 5042002). USDC collateral
(6 decimals). Reentrancy guards on USDC-moving functions. No proxies/upgrades.

## Contracts (see [../docs/tz/TZ_contracts.md](../docs/tz/TZ_contracts.md))
- **MarketFactory.sol** — `registerCreator` (onlyVerifier, after World ID), `createMarket`
  (onlyCreator) → deploys a Market; `MarketCreated` event for the indexer.
- **Market.sol** — binary **FPMM** (constant product): `buy`/`sell` along the curve (2% fee →
  LP feePool), `priceYes()`, `resolve(outcome, reason)` (onlyResolver, reason on-chain),
  `redeem()`, `addLiquidity`/`removeLiquidity`. Explicit "conditional settlement" (Arc prize).
  Fallback: 50/50 DemoMarket only if FPMM slips the schedule.
- **Resolver.sol** — `resolve(marketId, outcome, reason)` (onlyOracle = backend). CRE simulates;
  backend writes the actual resolve.

## Tests (Foundry)
happy path (create→buy→resolve→redeem), reverts (closeTime, non-creator, double-resolve,
redeem-before-resolve), fuzz invariant (reserve product non-decreasing on buy), no value leak.

## Deploy
`Deploy.s.sol`: Factory + Resolver, `setVerifier`/`setOracle` = backend addr, seed markets
(1 price / 1 subjective / 1 EURC). Addresses exported to backend + frontend config (not hardcoded).

> Status: scaffold. Build order per TZ_contracts §"Порядок работы".
