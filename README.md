# Justify — prediction markets where the AI oracle has to show its work

**ETHGlobal Lisbon 2026.** Markets settle on Base Sepolia over the audited Gnosis CTF/FPMM
stack. Subjective questions are resolved by an AI agent whose **verdict is produced through
0G Compute, whose evidence is pinned to 0G Storage, and whose reasoning is fed by live
indexed data from The Graph** — so anyone deciding whether to dispute a resolution can pull
the exact bundle the agent produced and check it against the same data the agent saw.
Autonomous trading agents bet real (testnet) money on the markets, and their on-chain track
record is distilled into a reputation score **sold per-query over x402** and reported into
the **ERC-8004** registry.

🔗 **Live:** https://justify.market
📈 **Subgraph:** [`justify-markets` on Base Sepolia](https://api.studio.thegraph.com/query/1756947/justify-markets/v0.2.0) ([Studio](https://thegraph.com/studio/subgraph/justify-markets))
⛓ **Settlement:** Base Sepolia (`84532`) · **Evidence:** 0G mainnet (`16661`) · **Agent identity:** Ethereum mainnet (ERC-8004)

---

## The trust pipeline

```
                        ┌───────────────────────────────────────────────┐
                        │            Base Sepolia (settlement)          │
 create ──▶ MarketRegistry ──▶ FPMM (Gnosis, audited) ◀── humans + AI agents trade
                        │        │ FPMMBuy/Sell events                  │
                        └────────┼──────────────────────────────────────┘
                                 ▼
                    The Graph subgraph (justify-markets)
              price from pool deltas · positions/PnL · resolution lifecycle
                                 │
              ┌──────────────────┼─────────────────────────┐
              ▼                  ▼                         ▼
        app reads          resolution agent          reputation scoring
     (charts, board,    reads live market context   (hit rate, calibration
      leaderboard)      before judging an outcome    edge, PnL, breadth)
                                 │                         │
                                 ▼                         ▼
                     0G Compute (deepseek-v4-pro)   x402 paywall ($0.005/query,
                     verdict, billed on-chain       USDC on Base Sepolia)
                                 │                         │
                                 ▼                         ▼
                     0G Storage: justification      ERC-8004 Reputation Registry
                     bundle by Merkle root          (Ethereum mainnet) — feedback
                                 │                  written only after a PAID read,
                                 ▼                  feedbackURI = the 0G report
                     JustifyAttestations on
                     0G Chain: root anchored
                                 │
                                 ▼
                     OptimisticSettler: public challenge window → UMA on dispute
```

Price questions skip all of this: a committed Chainlink Data Feed rule resolves them
deterministically on-chain (`CtfResolver.resolveByPrice`).

## What each partner does (and why it's load-bearing)

### The Graph — the data layer *and* the thing agents reason over
- **Subgraph** ([`subgraph/`](subgraph/), [README](subgraph/README.md)): indexes
  MarketRegistry, OptimisticSettler, CtfResolver, ConditionalTokens, plus each market's FPMM
  via a **data-source template**. The audited FPMM emits no price, so the mappings track pool
  balances **incrementally from event deltas** (no RPC calls) and derive the YES price;
  positions use average-cost accounting with realized PnL; the resolution lifecycle
  (proposed → challenged → finalized) folds into one entity. Verified against live trades to
  the last decimal.
- **Load-bearing reads**: the market chart and the leaderboard page query the subgraph
  directly from the browser; the resolution agent pulls a market's trading record (price
  drift, late one-sided flow, volume concentration, thin-market flags) through
  [`backend/src/subgraph.ts`](backend/src/subgraph.ts) **before judging** — and the exact
  GraphQL queries + responses ship inside the justification bundle. In the live demo the
  model's verdict opens with the market-microstructure caveat it derived from this data.
- **x402**: the reputation endpoint is paywalled with the same x402 rails The Graph's gateway
  uses for pay-per-query subgraphs — one funded wallet pays for data on one side and buys
  reputation on the other.
- **Nuthatch** ([`nuthatch/`](nuthatch/)): the self-hosted indexer runs against our contract
  on Base Sepolia — undocumented territory (only mainnets are built in). We Sourcify-verified
  the registry and hand-tuned the nest (`chain_id = 84532`, custom RPC, vendored ABI);
  `nuthatch sql "SELECT * FROM registry__market_created"` returns our live markets, giving
  agents a second, fully local SQL/MCP path to the same chain data.

### 0G — verifiable-by-construction AI resolutions
- **0G Compute**: the verdict model (`deepseek-v4-pro`, a TeeML provider with an on-chain
  acknowledged TEE signer) runs through the 0G serving network and **every request settles
  on-chain** against our prepaid ledger — "this verdict came through 0G Compute" is checkable
  from chain state, not from our word.
- **Honesty note, on purpose**: current 0G providers proxy to upstream APIs and do not serve
  per-response enclave signatures, so `processResponse()` cannot return true today. We record
  `verified: null` with the reason in every bundle and show "on-chain settled · response
  unsigned" in the UI instead of claiming "TEE verified". The attestation contract stores
  `teeVerified=false` honestly. A gap you can see beats a checkmark you can't check.
- **0G Storage**: every AI resolution publishes a justification bundle (question, the Graph
  data it reasoned over incl. raw queries, the model reply, compute attribution) —
  content-addressed by Merkle root. The on-chain `reason` carries `[evidence: 0g://<root>]`;
  the UI fetches bundles through the backend and links the public indexer gateway
  (`indexer-storage-turbo.0g.ai/file?root=…`) so judges read the bytes from 0G itself.
- **0G Chain**: [`JustifyAttestations`](contracts/src/JustifyAttestations.sol) at
  `0x9E10941b042e08C673623EE1Eb6d21E3a278A880` (deployed on **both** 0G mainnet 16661 and
  Galileo 16602) anchors every resolution: bundle root, outcome, TEE signer, verification
  status — append-only.

### World — two-step humanity + identity gate
Onboarding runs two World ID verifications: **Verify you're human**, then the **identity
check**. Trading needs only the first; **Create Market stays locked** (tooltip checklist on
hover, click opens the right onboarding step) until both pass, and the server enforces the
same gate in `/api/create-market`.

### ERC-8004 + x402 — the reputation economy
Trading agents (graphite / nullifier / moonboy — three strategy presets, real on-chain bets,
budgets and human approval thresholds) are registered in the ERC-8004 Identity Registry on
Ethereum mainnet (agentIds **36830–36832**); their `agentURI` resolves to
[`/api/agent-card/<addr>`](https://justify.market/api/agent-card/0x5aB9514b6F4D60B86cb1A53D76fFf4e0A90277cF),
which advertises the **paid x402 scoring endpoint**. `GET /api/reputation/:address` answers
HTTP 402; a funded wallet (no account, no API key) pays $0.005 USDC and gets the score with
per-bet evidence and the exact subgraph queries; the report is pinned to 0G Storage; and only
then does the server write `giveFeedback(score, tag1="trading", tag2="x402",
feedbackURI=<0G report>)` into the Reputation Registry from a distinct funded client — **the
registry only ever hears about reads somebody paid for**. Verified on-chain:
`getSummary(36832) → count 2, avg 68`.

Scoring formula (recomputable by anyone —
[`backend/src/reputation.ts`](backend/src/reputation.ts)):
`score = 100 · (0.35·hitRate + 0.30·edgeNorm + 0.20·pnlNorm + 0.15·breadth) · recency`,
resolved markets only; the calibration term rewards buying YES at 0.60 on a market that
resolves YES, and `breadth` (distinct resolved markets) blunts wash-trading.

## Deployed addresses

| What | Where | Address |
|---|---|---|
| MarketRegistry | Base Sepolia | `0x90C69EdcB18F238594C974EA2a60067534622236` ([Sourcify-verified](https://sourcify.dev/server/v2/contract/84532/0x90C69EdcB18F238594C974EA2a60067534622236)) |
| ConditionalTokens (Gnosis) | Base Sepolia | `0x73FA4E26d22b4e2f1B68dD74b56bca62bDAdfbd7` |
| CtfResolver | Base Sepolia | `0xB66741Fe9da3D70A986BF7A0646b6E19dcFDBdac` |
| OptimisticSettler (UMA OOv3 on dispute) | Base Sepolia | `0xB35A5ee43f6B5770B56AF22064Fc0692BdFe134c` |
| JustifyAttestations | 0G mainnet + Galileo | `0x9E10941b042e08C673623EE1Eb6d21E3a278A880` |
| ERC-8004 Identity / Reputation | Ethereum mainnet | `0x8004A169…a432` / `0x8004BAa1…9b63` |

## Repo layout

```
frontend/   Vite + React SPA (justify.market) — charts/leaderboard read The Graph directly
backend/    Fastify: resolution agent (0G Compute), justification bundles (0G Storage),
            x402-gated reputation API, ERC-8004 reporting, trading-agent loop
subgraph/   The Graph subgraph (Base Sepolia) — see subgraph/README.md
contracts/  Foundry: MarketRegistry, CtfResolver, OptimisticSettler, JustifyAttestations
nuthatch/   Nuthatch nest: our registry as a local SQL/MCP index (Base Sepolia, undocumented)
docs/       specs & build notes (docs/tz/TZ_GRAPH_0G.md is the phase-2 spec + status log)
```

## Run it

```bash
# backend (needs backend/.env — see backend/.env.example)
cd backend && npm i && NETWORK=base-sepolia npm start
# frontend
cd frontend && npm i && npm run dev
# buy an agent's reputation like a machine would (x402):
cd backend && X402_BUYER_PK=0x… npx tsx scripts/buy-reputation.ts <agentAddress> https://justify.market
```

## Before vs during the hackathon

The prediction-market core (FPMM trading UI, social feed, profiles) and the Base Sepolia
CTF deployment predate the event. Built **during** ETHGlobal Lisbon 2026: the entire subgraph
and both Graph read-paths, the Subgraph-context resolution pipeline, all 0G integration
(Compute, Storage, both chain deployments), the x402 reputation layer, ERC-8004 registration
+ economically-backed feedback, the two-step World ID gate, the Nuthatch nest, and the
agents' first live, scored track records.
