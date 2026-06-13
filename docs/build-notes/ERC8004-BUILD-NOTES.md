# ERC-8004 integration — what we built (Block 1.3)

Live: https://88.198.118.236.nip.io/agents — each agent has a **"Register ERC-8004"** button.

## On-chain
- **Identity Registry** (Ethereum mainnet, CREATE2): `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` — VERIFIED on Etherscan.
- **Reputation Registry**: `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`.
- `register(agentURI)` mints an ERC-721 → `agentId`. We parse `Registered` event from the receipt.
- **Simulated against the real contract (no spend):** would mint agentId #34455, gas ≈203k, cost ≈**$0.10** at current 0.13 gwei. Signer (ENS_OWNER `0x6751…88C0`) holds ~0.0056 ETH = plenty.

## Files
- `lib/erc8004.ts` — chain-configurable (`ERC8004_CHAIN=mainnet|base`), `registerAgent`, `giveFeedback`, `agentRef` (CAIP-19), `readSummary`, explorer helpers.
- `app/api/agent-card/[addr]/route.ts` — serves the **registration JSON** (= `agentURI` = `tokenURI`). Judges click tokenURI on Etherscan → resolvable identity (name, ENS, strategy, on-chain ref).
- `app/api/erc8004/register/route.ts` — **EXPLICIT action** (not in any loop, per project rule). Registers on mainnet → stores `erc8004Id` → binds ENS name → agentId via ENSIP-26 text records `registrations[0]` + `com.justify.erc8004`. Idempotent.
- `app/api/reputation/route.ts` — extended: now ALSO writes **on-chain ERC-8004 feedback** (`giveFeedback`, accuracy) when an `erc8004Id` is passed, alongside ENS text records. Best-effort (needs a DISTINCT client key — `REPUTATION_CLIENT_PK`/`AGENT_PK` — since the registry blocks self-feedback by the owner).
- `app/agents/page.tsx` — "Register ERC-8004" button → badge `⬡ ERC-8004 #id` linking to Etherscan token page.

## Design decisions
- **Not auto-registered on agent creation** — would silently spend real L1 ETH per agent. Explicit button = project rule "ERC-8004 + subname mints by explicit action, NOT in loops".
- **agentURI** = `${PUBLIC_ORIGIN}/api/agent-card/<address>` (address known pre-register → stable URI, single tx, no chicken-egg).
- **Reputation self-feedback constraint**: registry blocks owner/operator feedback → needs a separate funded client key. Wired but best-effort; identity (the prize headline) needs no second key.
- **Chain switch to Base**: set `ERC8004_CHAIN=base` + `BASE_RPC` + fund the signer on Base → same CREATE2 addresses, ~free gas. Default mainnet (signer already funded there, consistent with ENS).

## TODO before judging
- Press the button once on a demo agent to get a real agentId on Etherscan (costs ~$0.10).
- (optional) Fund a `REPUTATION_CLIENT_PK` on mainnet to demo live on-chain reputation after a resolution.
