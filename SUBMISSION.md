# Justify — ETHGlobal Lisbon 2026 submission notes

Copy-paste material for the submission forms. Overview: [README.md](README.md).
Phase-2 spec + build log: [docs/tz/TZ_GRAPH_0G.md](docs/tz/TZ_GRAPH_0G.md).

## One-liner
Prediction markets where the AI oracle has to show its work: verdicts run through 0G Compute,
evidence pins to 0G Storage, the reasoning is fed by The Graph, and the trading agents' track
record is sold as reputation over x402 into ERC-8004.

## Links
- **Live demo:** https://justify.market
- **Repo:** https://github.com/evacodes-dev/justify
- **Demo video:** (add link, ≤2:50)
- **Subgraph endpoint:** https://api.studio.thegraph.com/query/1756947/justify-markets/v0.2.0
- **Subgraph Studio:** https://thegraph.com/studio/subgraph/justify-markets

## Team
- Vadim Kotov — TG: (fill) · X: (fill)

---

## The Graph prize — checklist + proof

Tracks: **Best AI Use Case** (+ Continuity), **Best Composable/Standardized** (4 products).

- ✅ **Load-bearing live data (no mocks)**: custom subgraph on Base Sepolia indexes our 4
  contracts + FPMM data-source template. Custom mappings: pool-delta price derivation
  (no RPC per trade), average-cost PnL, resolution lifecycle. `subgraph/` + README.
- ✅ **AI reasons over the data**: the resolution agent queries the subgraph before judging
  (`backend/src/subgraph.ts` → `describeMarketContext`); the model's live verdict for market
  #13 opens with "The market is extremely thin (0 trades, $0 volume…), so the 50% price is
  uninformative" — derived from indexed data, recorded in the bundle:
  `0g://0x49b6cb0d6a1aeb91d71bbd6fb4e4324ee9feb430bd95bcecfc1fa7f8b4b8e0bf`.
- ✅ **App reads The Graph directly**: market chart (`useMarketHistory`) + `/leaderboard`
  page (browser → subgraph, no backend).
- ✅ **x402**: `/api/reputation/:address` is x402-paywalled (`@x402/fastify`, Base Sepolia
  USDC, facilitator x402.org). Settled payments:
  `0x7ac0cb524cdef783d9903b694484d928c19d2161f36ac8dc96ce7e91049640e3`,
  `0x957ca98c70a3c61317b6276eaaf9ac5df767485da0c43a902de6b8beb21fc1a4` (Base Sepolia).
  Buyer client: `backend/scripts/buy-reputation.ts` (@x402/fetch).
- ✅ **Nuthatch on Base Sepolia (undocumented)**: Sourcify-verified our registry, hand-tuned
  the nest (`nuthatch/`), `nuthatch sql` returns live markets. Second, local SQL/MCP data
  path for agents.
- ✅ **MCP server (`mcp/`)** — targets **Best AI Tooling**: reusable, zero-dependency stdio MCP
  server over the live subgraph. Six tools; `get_market_context` returns a judgement on whether
  a price is informative (thin market / concentration / late flow), `get_agent_reputation` is
  **x402-paid** and settles USDC autonomously. Ships README + SKILL.md; `node test-client.mjs`
  exercises every tool against live data.
- Products composed: **Subgraph + x402 + Nuthatch + MCP** (+ Subgraph data in every AI bundle).

## 0G prize — checklist + proof

Track: **Best AI Product on 0G** (mandatory: inference через 0G Compute, с пруфом).

- ✅ **0G Compute inference**: verdict model `deepseek-v4-pro` (TeeML provider
  `0xB01EBd79c3fd63ff52fD47C3935119601EEe2FdB`, TEE signer acknowledged on-chain), prepaid
  ledger from agent wallet `0xAbebD0B9a8Eaaa94d4E0Bd42A0999a64Cb13aB69`, every request billed
  on-chain (chain 16661).
- ✅ **0G Storage**: justification bundle per AI resolution + per reputation report,
  content-addressed; served back via public gateway
  `https://indexer-storage-turbo.0g.ai/file?root=<root>`.
- ✅ **Contract deployment addresses**: `JustifyAttestations`
  `0x9E10941b042e08C673623EE1Eb6d21E3a278A880` on **0G mainnet (16661)** and **Galileo
  (16602)**; anchor tx (market 13): on-chain `latest(13)` returns the bundle root.
- ✅ **Live link**: https://justify.market (market 13 shows the full evidence panel).
- ✅ **Honesty**: current providers proxy upstream and serve no per-response enclave
  signature → we surface "on-chain settled · response unsigned" instead of claiming TEE
  verification. Judges can check `verificationNote` in any bundle.
- 0G features used: **Compute + Storage + Chain** (Galileo & mainnet).

## World prize — what we built

Two-step World ID gate: humanity verification (existing flow) + **identity check** (second
verification, own action id). Trading needs step 1 only; **Create Market is locked** with a
hover tooltip checklist until both pass; server enforces the same in `/api/create-market`.
Flow: `OnboardingModal` (4-step), `SidebarNav` (locked button → opens the right step).

## ERC-8004 (bonus narrative)

Agents registered on Ethereum mainnet: agentIds **36830 / 36831 / 36832**
(`https://etherscan.io/token/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432?a=36832`).
Paid x402 reads write `giveFeedback(score, tag1="trading", tag2="x402", feedbackURI=<0G
report>)` from a distinct funded client. On-chain proof: `getSummary(36832) → count 2,
avg 68`. Feedback txs:
`0x5f1ba7fe4efac6e3a6c56ab0572046ae3d4aeaf42fc9f67f1ac78b4ed3eab890`,
`0xa2a5b0aed0e731f293729f568d941a4d25bfee69ba41d7bbd8b9a684316c26dd`.
agentURI → `https://justify.market/api/agent-card/<address>` (identity advertises the paid
scoring endpoint).

## Demo flow (для видео, ≤2:50)

1. (0:00) justify.market — market #13 "Is Lisbon the capital of Portugal?" — resolved by AI.
2. (0:20) Evidence panel: verdict cites thin-market data from The Graph; click "show
   evidence" → the GraphQL query + summary; "evidence on 0G Storage" → raw bundle from the
   0G gateway.
3. (0:55) Leaderboard — live from the subgraph (synced block in the footer). Agents traded
   market #14 (ETH>$2500), Chainlink resolved NO, agents won.
4. (1:20) Terminal: `buy-reputation.ts` → HTTP 402 → USDC payment settles on Base Sepolia →
   score 68/100 + bundle root.
5. (1:50) Etherscan: ERC-8004 getSummary(36832) = 2 feedbacks, avg 68 — economically backed
   reputation, feedbackURI = the 0G report.
6. (2:15) Create Market locked → hover tooltip (2 verifications) → onboarding: human →
   identity → unlocked.
7. (2:40) Attestations contract on 0G chainscan. Close.
