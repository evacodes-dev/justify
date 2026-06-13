# World AgentKit — Research Notes (hackathon)

> Researched 2026-06-13. Everything below is confirmed from official sources only.
> Primary sources:
> - Docs: https://docs.world.org/agents/agent-kit/integrate  and  https://docs.world.org/agents/agent-kit
> - Repo: https://github.com/worldcoin/agentkit  (raw files: `README.md`, `cli/REGISTRATION.md`, `x402/DOCS.md`)
> - npm registry: https://registry.npmjs.org/@worldcoin/agentkit  and  /@worldcoin/agentkit-cli
> - Announcement: https://world.org/blog/announcements/now-available-agentkit-proof-of-human-for-the-agentic-web
> Local doc mirror: `C:\Users\Вадим\hack-docs\agentkit\` (README.md, cli-REGISTRATION.md, x402-DOCS.md, npm-*-metadata.json)
>
> **What AgentKit actually is:** a *complementary extension to the x402 v2 protocol* (Coinbase/Cloudflare).
> It is NOT a standalone auth framework — it bolts proof-of-human onto x402 paywalled routes.
> A protected route returns `402`, the agent re-signs with an `agentkit` header, the server looks the
> agent wallet up in the on-chain **AgentBook** registry and resolves it to an anonymous **humanId**.

---

## 1. Install + setup

```bash
# SDK (server + agent client)
npm install @worldcoin/agentkit
# or: bun add @worldcoin/agentkit

# Registration CLI (separate package)
npm install -g @worldcoin/agentkit-cli
# or run ad-hoc: npx @worldcoin/agentkit-cli register <agent-address>
```

- **No API key / no env var is required for the core SDK.** Identity is via wallet signatures + on-chain
  AgentBook lookups, not an API token. (Docs show no `AGENTKIT_API_KEY` anywhere.)
- Optional env var `API_URL` — only for the **CLI registration relay** override (see §2).
- Optional relayer example env `RELAYER_PRIVATE_KEY` — only if you run your own gasless relay.
- Server reads the AgentBook on **World Chain** by default; you may pass a custom `rpcUrl` to
  `createAgentBookVerifier()` / `createAgentkitHooks()`.
- Peer stack: built on `@x402/core`, `@x402/evm`, `viem`, `siwe`. Messages are EIP-4361 (SIWE) /
  CAIP-122; signatures `eip191` (EOA), `eip1271`/`eip6492` (smart wallets).

---

## 2. Register an agent

### CLI (confirmed syntax)
```bash
npx @worldcoin/agentkit-cli register <agent-address>            # defaults to Base mainnet + gasless relay
npx @worldcoin/agentkit-cli register <agent-address> --manual   # print raw call data, you self-send
npx @worldcoin/agentkit-cli register <agent-address> --network base-sepolia --auto
npx @worldcoin/agentkit-cli status  <agent-address>             # check if already registered
```
LLM/agent convenience flow: `npx @worldcoin/agentkit-cli --llms` (prints machine-readable instructions).

**What the owner must do:** have **World App on a phone**. The CLI:
1. reads the next required `nonce` for the agent address from AgentBook,
2. builds a World ID verification request bound to the tuple `(agent address, nonce)`,
3. prints a **QR code + deep link** to scan with World App,
4. after the World ID proof completes, returns `{ agent, root, nonce, nullifierHash, proof, contract, network }`,
5. submits the tx.

**Gasless?** Yes by default on **Base mainnet** via a hosted relay (the backend pays gas, not the agent).
- Shared hosted relay base URL: `https://x402-worldchain.vercel.app` (POSTs to `{API_URL}/register`).
- Override with your own relay: `API_URL=https://your-api.example.com agentkit register <addr> --network base --auto`.
- `--manual` returns call data so you self-send. Other networks need an explicit `API_URL` (no default relay).

### Programmatic / on-chain equivalent
There is **no high-level JS "register()" SDK function** — registration is done through the CLI (which
produces the proof) or by calling the AgentBook contract directly. The CLI emits exactly the inputs for:
```solidity
register(address agent, uint256 root, uint256 nonce, uint256 nullifierHash, uint256[8] proof)
```
You can drive it programmatically by POSTing the CLI payload to a relay (`POST {API_URL}/register`,
JSON body `{ agent, root, nonce, nullifierHash, proof, contract, network }`, returns `{ txHash }`),
or by sending the `register(...)` call yourself with viem. The World ID proof generation still requires
World App.

### Networks + AgentBook contract addresses (confirmed, from CLI docs)
| Network          | CAIP-2          | AgentBook address |
| ---------------- | --------------- | ----------------- |
| Base mainnet     | `eip155:8453`   | `0xE1D1D3526A6FAa37eb36bD10B933C1b77f4561a4` |
| Base Sepolia     | (testnet)       | `0xA23aB2712eA7BBa896930544C7d6636a96b944dA` |
| World Chain      | `eip155:480`    | `0xA23aB2712eA7BBa896930544C7d6636a96b944dA` |

> IMPORTANT nuance: the **CLI writes** registrations to the chain you pass (`base` default / `base-sepolia`).
> But the **server-side verifier (`createAgentBookVerifier`) ALWAYS reads the canonical AgentBook on
> World Chain `eip155:480`**, regardless of which chain the agent signed on or your paid route runs on.
> (The docs are explicit that lookup is chain-agnostic and resolves on World Chain.) Your paid route can be
> on any EVM chain.

---

## 3. Anti-sybil / per-human quota

Flow: agent signs a CAIP-122 challenge → server recovers the **wallet address** → `agentBook.lookupHuman(address)`
returns the **anonymous humanId** (or `null` if unregistered). Usage is then tracked **per humanId per endpoint**,
NOT per wallet — so multiple agents owned by the same person share one counter (the anti-sybil property).

Exact calls:
- **Resolve agent wallet → human:**
  `const humanId = await agentBook.lookupHuman(address)` → `Promise<string | null>` (hex human id, or null).
- **Enforce a quota:** via the `AgentKitStorage` interface:
  `tryIncrementUsage(endpoint, humanId, limit): Promise<boolean>` — atomically increments if below `limit`,
  returns `true` if allowed / `false` if the per-human limit is already hit.
  Plus optional replay guards `hasUsedNonce(nonce)` / `recordNonce(nonce)`.
  Reference impl: `InMemoryAgentKitStorage` (for prod, back it with a DB + row-level lock).

Quota is normally declared via the `mode` on `createAgentkitHooks` (see §4) rather than called by hand:
- `{ type: 'free' }` — human-backed agents always bypass payment (no storage needed).
- `{ type: 'free-trial', uses: N }` — first N actions free **per human** (default 1). e.g. "M free-trial actions".
- `{ type: 'discount', percent: P, uses: N }` — P% off for the first N actions per human.

> Note: "N **agents** per human" as a hard cap is NOT a built-in mode. The docs cap **actions/usage** per human,
> not agent count. To enforce "max N agents per human" you'd implement it yourself off the `humanId` from
> `lookupHuman`. The press framing of "cap agents per human" maps in the SDK to per-human *usage* counters.

---

## 4. Server middleware / proof-of-human gate

The reference path is the **hooks** approach layered on an x402 resource server (docs use **Hono**, not Next.js;
no Next-specific package exists in V1 — same helpers apply wherever you handle HTTP).

Imports (all from one package):
```typescript
import {
  declareAgentkitExtension,
  agentkitResourceServerExtension,
  createAgentkitHooks,
  createAgentBookVerifier,
  InMemoryAgentKitStorage,
} from '@worldcoin/agentkit'
```

Wiring shape:
```typescript
const agentBook = createAgentBookVerifier()                 // reads canonical AgentBook on World Chain
const storage   = new InMemoryAgentKitStorage()
const hooks     = createAgentkitHooks({
  agentBook,
  storage,
  mode: { type: 'free-trial', uses: 3 },                    // per-human quota lives here
})

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(NETWORK, new ExactEvmScheme())
  .registerExtension(agentkitResourceServerExtension)       // <-- the proof-of-human extension

// discount mode only:
if (hooks.verifyFailureHook) facilitatorClient.onVerifyFailure(hooks.verifyFailureHook)

const routes = {
  'GET /data': {
    accepts: [{ scheme: 'exact', price: '$0.01', network: NETWORK, payTo }],
    extensions: declareAgentkitExtension({
      statement: 'Verify your agent is backed by a real human',
      mode: { type: 'free-trial', uses: 3 },
    }),
  },
}

const httpServer = new x402HTTPResourceServer(resourceServer, routes)
  .onProtectedRequest(hooks.requestHook)                    // <-- gate runs here
```

So the gate = `agentkitResourceServerExtension` registered on the resource server + `hooks.requestHook`
registered via `.onProtectedRequest()`. `createAgentkitHooks` returns `{ requestHook, verifyFailureHook? }`.

**Agent (client) side** of the same flow:
```typescript
import { createAgentkitClient } from '@worldcoin/agentkit'
const agentkit = createAgentkitClient({
  signer: { address, chainId: 'eip155:8453', type: 'eip191', signMessage: m => wallet.signMessage(m) },
})
await agentkit.fetch('https://api.example.com/data')        // auto-retries 402 with signed agentkit header
```

**Next.js note:** docs don't ship a Next adapter. In a Next API route you'd use the **manual / low-level**
helpers instead of the Hono middleware:
`parseAgentkitHeader(header)` → `validateAgentkitMessage(payload, resourceUri)` →
`verifyAgentkitSignature(payload)` → `agentBook.lookupHuman(verification.address)` → apply policy yourself.
(There is a documented "Manual Usage (Advanced)" block with exactly these calls.)

Hook events you can observe: `agent_verified {resource,address,humanId}`, `agent_not_verified`,
`validation_failed`, `discount_applied`, `discount_exhausted`.

---

## 5. Human-in-the-loop (owner approval before a large action)

**Not present in AgentKit V1.** The docs have NO API for an agent to request owner approval / World ID
confirmation before a large action (no `requestApproval`, no per-action consent flow). The only human
interaction is the **one-time registration** (World ID via World App binding the wallet to a humanId).
After that, verification at request time is fully automatic: signature check + AgentBook lookup, no live
owner prompt.

If you need human-in-the-loop for the hackathon, you must build it yourself (e.g. trigger a World ID
verification / wallet-auth confirmation in World App via IDKit / MiniKit out-of-band). That is outside
what `@worldcoin/agentkit` provides.

---

## 6. Gotchas / version

- **Current version: `0.2.0`** for BOTH `@worldcoin/agentkit` and `@worldcoin/agentkit-cli` (npm `latest`
  tag, confirmed via registry). Press articles citing 0.1.5 are stale. (First publish was 0.0.1 on 2026-03-06;
  0.0.1/0.1.x are deprecated.)
- **Limited beta / developer preview.** A "more robust 1.0" is planned. No special beta HTTP header is
  required in code.
- **Phone required for setup only:** World App on a mobile device is needed to complete the World ID proof
  during **registration**. It is NOT needed at request/verify time.
- **Server-side: yes (Node).** Works as a normal npm package in a Node server. Reference example is Hono on
  Node (`@hono/node-server`). No Next.js adapter in V1 — use the low-level helpers in a Next route handler.
- **x402-coupled:** AgentKit is an extension of x402 v2; the natural fit is paywalled/metered routes. Using it
  purely as a "is this agent human-backed?" gate works via the manual helpers + `lookupHuman`, but the
  ergonomic hooks path assumes an x402 resource server.
- **Verifier always hits World Chain** for AgentBook lookups even though the CLI registers on Base by default —
  don't mismatch this. Your registration must be readable from the canonical World Chain AgentBook the verifier
  queries (default `createAgentBookVerifier()`), or override `contractAddress`/`rpcUrl` to match your deployment.
- Smart wallets (Safe, Coinbase Smart Wallet, CDP) supported out of the box (EIP-1271/6492).
- AgentBook lookups happen at request time, so **revoked registrations take effect immediately**.

---
Artifact path: `C:\Users\Вадим\hack-sandbox\app\AGENTKIT_NOTES.md`
Doc mirror:    `C:\Users\Вадим\hack-docs\agentkit\`
