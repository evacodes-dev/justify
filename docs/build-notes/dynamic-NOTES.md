# Dynamic (dynamic.xyz) — Pre-Validation Notes

Docs domain: docs.dynamic.xyz (canonical page URLs render under https://www.dynamic.xyz/docs).
Index files confirmed: https://docs.dynamic.xyz/llms.txt (works) and /llms-full.txt (HTTP 200, ~5.98 MB).
Downloaded source pages: `C:\Users\Вадим\hack-docs\dynamic\`
Date gathered: 2026-06-11.

IMPORTANT NAMING FACT: Dynamic's "Flow" product is officially **"Fireblocks Flow"**.
Do NOT confuse it with the **Flow blockchain** (`@dynamic-labs/flow`, "Flow Cadence"
wallet connectors) — that is an unrelated chain integration. All deposit/payment
"Flow" facts below refer to Fireblocks Flow.

---

## 1. React SDK Quickstart

Source: https://www.dynamic.xyz/docs/react/reference/quickstart
Also: https://www.dynamic.xyz/docs/react/reference/providers/dynamiccontextprovider
Also: https://www.dynamic.xyz/docs/react/reference/hooks/usedynamiccontext

### npm package names
- Core (always required): **`@dynamic-labs/sdk-react-core`** — exports `DynamicContextProvider`, `DynamicWidget`, `useDynamicContext`.
- EVM chain connectors: **`@dynamic-labs/ethereum`** (exports `EthereumWalletConnectors`).
- Other chains (only if needed): `@dynamic-labs/solana` (SVM), `@dynamic-labs/bitcoin`, `@dynamic-labs/sui`, `@dynamic-labs/cosmos`, `@dynamic-labs/starknet`, `@dynamic-labs/flow` (Flow blockchain — NOT Fireblocks Flow), etc.
- Optional Wagmi: `@dynamic-labs/wagmi-connector wagmi@2 @tanstack/react-query` (must pin `wagmi@2`; wagmi@3 is incompatible).
  Source: quickstart "Package Mapping" section.

Install (EVM quickstart): `npm i @dynamic-labs/sdk-react-core @dynamic-labs/ethereum`

### Minimal steps to add DynamicContextProvider
(Quickstart's canonical example targets Vite; the same provider/hook code applies to Next.js. The docs do not ship a separate Next.js quickstart page in the index — see CAVEATS.)

1. Install `@dynamic-labs/sdk-react-core` + `@dynamic-labs/ethereum`.
2. Wrap the app root in `DynamicContextProvider`:
   ```tsx
   import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core';
   import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';

   <DynamicContextProvider
     settings={{
       environmentId: 'YOUR_ENVIRONMENT_ID',
       walletConnectors: [EthereumWalletConnectors],
     }}
   >
     <App />
   </DynamicContextProvider>
   ```
3. Drop `<DynamicWidget />` somewhere inside the provider for out-of-the-box auth + wallet UI.
   Source: quickstart Steps 5–6.

Next.js note: in the Next.js App Router the provider must live in a Client Component
(`'use client'`). The docs index lists a Next.js hydration troubleshooting page
(https://www.dynamic.xyz/docs/overview/troubleshooting/next/hydration-failed) but the
quickstart example itself is Vite-based.

### Reading the embedded wallet address after login
Use the `useDynamicContext` hook; read `primaryWallet.address`:
```tsx
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
const { primaryWallet, user, handleLogOut } = useDynamicContext();
primaryWallet?.address   // the wallet address (string)
primaryWallet?.chain     // chain ID (number, NOT a human-readable name)
user?.email              // authenticated user email
```
Source: quickstart "Post-login patterns" / Step 7.
For embedded (WaaS) wallets specifically, the **Embedded Wallets** feature must be
enabled in the dashboard (under Wallets) or no embedded wallet is created after login.
Source: quickstart "Troubleshooting — Dashboard Configuration #3".

### Env var / environmentId
- The required value is the **environment ID**, passed as `settings.environmentId` to
  `DynamicContextProvider` (a string). The docs pass it inline as `'YOUR_ENVIRONMENT_ID'`.
- The docs do NOT prescribe a specific env-var NAME. There is no documented
  `DYNAMIC_ENVIRONMENT_ID` constant in the React quickstart — it's just whatever you
  store the ID in (commonly `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` in Next.js, but that
  naming is the developer's choice, not mandated by the docs).
- Get the environment ID from the dashboard: https://app.dynamic.xyz/dashboard/developer/api
  Source: quickstart "Prerequisites" / Step 1.
- Also required in dashboard for things to work: chain enabled, sign-in method enabled,
  embedded wallets enabled, and your origin (e.g. http://localhost:5173) added to
  Allowed Origins (CORS). Source: quickstart Troubleshooting #1–#4.

---

## 2. Flow (Fireblocks Flow) — what it is

Source: https://www.dynamic.xyz/docs/overview/fireblocks-flow

Fireblocks Flow lets your users pay from any wallet, exchange, or chain and you receive
the token you want, on the chain you want, at the address you want. Cross-chain
swap/bridge conversion is automatic and abstracted. Two modes:
- **Payment** — receiver sets a fixed amount (e.g. $25 USDC). For checkout flows.
- **Deposit** — sender chooses the amount (configurable minimums/presets). For account funding.
It is direction-agnostic and also supports **Withdrawals** (money-out) and cross-chain conversion.
Source chains: EVM, Solana, Sui, Bitcoin, Stellar, TON (auto swap/bridge only on EVM/SOL/SUI/BTC).
Funding sources: external wallets (MetaMask, Phantom, Coinbase Wallet…), exchange accounts
(Coinbase, Kraken, Crypto.com, Binance; Robinhood "coming soon"), and unique deposit
addresses ("coming soon"). Settlement can land in a Fireblocks vault or a Dynamic embedded wallet.

---

## 3. How a deposit-intent is created (REST endpoint vs widget)

It is created via **REST API** (or the JS SDK wrapping the same API). **There is NO
embeddable widget/component for Flow yet** — the overview explicitly states:
"A pre-built UI widget is coming soon."
Source: https://www.dynamic.xyz/docs/overview/fireblocks-flow ("Build with Fireblocks Flow")

### REST API flow (8-step state machine)
Source: https://www.dynamic.xyz/docs/overview/fireblocks-flow-api
- Base URL: **`https://app.dynamicauth.com/api/v0`**
  (the JS-SDK guide instead shows `https://app.dynamic.xyz/api/v0` for create-checkout — both Dynamic hosts.)
- Auth for checkout management: `Authorization: Bearer dyn_...` (env API token from Developer > API Tokens).
- Transaction mutations use a per-transaction header `x-dynamic-checkout-session-token: dct_...`.

Endpoints (the deposit-intent = a "checkout" + a "transaction"):
1. **Create checkout** (reusable deposit config — settlement token/chain + destination):
   `POST /environments/{environmentId}/checkouts`  (body: `mode`, `settlementConfig`, `destinationConfig`, `enableOrchestration`)
   Returns `id` → use as `checkoutId`.
2. **Create transaction** (the actual deposit/payment intent; returns session token `dct_...`):
   `POST /sdk/{environmentId}/checkouts/{checkoutId}/transactions`
3. Attach source:  `POST /sdk/{environmentId}/transactions/{transactionId}/source`
4. Get quote:      `POST /sdk/{environmentId}/transactions/{transactionId}/quote`
5. Prepare signing:`POST /sdk/{environmentId}/transactions/{transactionId}/prepare`
6. Sign + broadcast on-chain (client-side, with user's wallet)
7. Notify backend: `POST /sdk/{environmentId}/transactions/{transactionId}/broadcast`
8. Wait for settlement: poll `GET /sdk/{environmentId}/transactions/{transactionId}` or use webhooks.
   Manage checkouts: `GET`/`PATCH`/`DELETE` on `/environments/{environmentId}/checkouts/{checkoutId}`.
   Out-of-order calls return 409.

### JS SDK alternative (same flow)
Source: https://www.dynamic.xyz/docs/overview/fireblocks-flow-js-sdk
- Package: **`@dynamic-labs-sdk/client`** (note: different scope than the React SDK's `@dynamic-labs/*`).
- Uses the `checkout` namespace. Functions: `createCheckoutTransaction`,
  `attachCheckoutTransactionSource`, `getCheckoutTransactionQuote`,
  `submitCheckoutTransaction` (prepare+sign+broadcast), `getCheckoutTransaction` (poll),
  `cancelCheckoutTransaction`.
- Create-checkout example here POSTs to: `https://app.dynamic.xyz/api/v0/environments/<ENV_ID>/checkouts`.

---

## 4. Does Flow require separate access / sales approval / allowlist?

YES. Fireblocks Flow is **enterprise-only and is NOT on by default**. Both the overview
and the API guide carry the same Note:
"This is an enterprise-only feature. Please contact us to enable."
Request enablement at: **https://www.dynamic.xyz/book-a-call** (book-a-call / sales contact).
The API guide's Prerequisites also require "A Dynamic environment with Fireblocks Flow enabled."
Sources:
- https://www.dynamic.xyz/docs/overview/fireblocks-flow (enterprise-only Note)
- https://www.dynamic.xyz/docs/overview/fireblocks-flow-api (enterprise-only Note + Prerequisites)

HACKATHON FLAG: This means Flow likely cannot be self-serve enabled in a Sandbox during a
hackathon — it requires a sales/enterprise conversation. Plan accordingly.

---

## 5. Testnet / Sandbox mode for Flow?

PARTIAL. The Fireblocks Flow docs do NOT advertise a general sandbox; they state
"Except for the EVM chains listed below, only mainnet is supported," with these EVM
testnets explicitly supported for the checkout flow:
- Base Sepolia `84532`, Arbitrum Sepolia `421614`, Arc Testnet `5042002`, OP Sepolia `11155420`.
Source: https://www.dynamic.xyz/docs/overview/fireblocks-flow-js-sdk ("Supported Chains")

Separately, every Dynamic *project* (not Flow-specific) has a general Sandbox vs Live
environment (Sandbox = free, limited to 1000 users) — but that page does not mention Flow.
Source: https://www.dynamic.xyz/docs/overview/developer-dashboard/sandbox-vs-live

So: there is NO Flow "test/fake-money" sandbox documented — instead you test against a
handful of real EVM testnets. Solana/Sui/Bitcoin and other chains are mainnet-only for Flow.

---

## 6. Status webhooks — events & payload shape

Source: https://www.dynamic.xyz/docs/overview/fireblocks-flow-api ("Wait for Settlement" / webhooks)
Also: https://www.dynamic.xyz/docs/overview/fireblocks-flow (Webhooks section)

- Webhooks are **HMAC-signed** and fire at every lifecycle transition (execution state,
  settlement state, risk/compliance state, quote updates).
- Register a webhook: `POST /environments/{environmentId}/webhooks` with
  `{ "url": "...", "events": [...], "isEnabled": true }`.
- Documented event names (subscribe by name):
  - `execution.state.broadcasted`
  - `execution.state.source_confirmed`
  - `settlement.state.completed`   → payment done, fulfill the order
  - `execution.state.failed`       → inspect `data.failure`
  - `settlement.state.failed`      → inspect `data.failure`
- Payload shape (request body) contains at least:
  - `eventName` (e.g. `"settlement.state.completed"`)
  - `data` object — includes `data.transactionId` and, on failures, `data.failure`.
  Example handler reads `const { eventName, data } = req.body;` and switches on `eventName`.
- Best practice: respond 200 quickly, process async.
- General Dynamic webhook setup / signature verification:
  https://www.dynamic.xyz/docs/overview/developer-dashboard/webhooks/setup
  https://www.dynamic.xyz/docs/recipes/webhooks-signature-validation

---

## CAVEATS / things the docs do NOT clearly answer

- **No dedicated Next.js Flow/quickstart page.** The React quickstart example is Vite-based;
  Next.js specifics (App Router `'use client'`, env-var name) are inferred, not spelled out
  in a single Next.js quickstart. There is only a Next.js *hydration* troubleshooting page.
- **No mandated env-var name.** Docs use `settings.environmentId` inline; there is no
  documented `DYNAMIC_ENVIRONMENT_ID` constant. The env-var name is the developer's choice.
- **Two different Base URLs** appear for the checkout API: `app.dynamicauth.com/api/v0`
  (API guide) vs `app.dynamic.xyz/api/v0` (JS SDK guide). Verify which your tenant uses.
- **Two different SDK package scopes:** React SDK = `@dynamic-labs/*`; Flow JS client =
  `@dynamic-labs-sdk/client`. Don't mix them up.
- **No webhook signature/secret payload schema** is shown inline in the Flow guide beyond
  "HMAC-signed" — full signature verification is on the general webhooks pages.
- **Flow widget does not exist yet** ("coming soon"); deposit addresses and Robinhood
  source are also "coming soon."
- **Flow enablement is gated behind sales (book-a-call)** — no self-serve toggle documented.
