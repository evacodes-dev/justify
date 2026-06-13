# Blink — Deposit / On-ramp SDK Pre-validation Notes

**Correct docs domain: `docs.blink.cash`** (verified, resolves, has `/llms.txt` + `/llms-full.txt`).
This IS the right Blink: a crypto deposit/bridge widget embeddable via SDK, used to fund an
embedded-wallet address in one tap. It sits on top of wallet infra (Privy, Turnkey, Dynamic) —
"Blink is not a wallet". npm scope is `@swype-org` (company = Swype).

Raw docs mirrored to: `C:\Users\Вадим\hack-docs\blink\`

---

## 1. How do you embed the widget?

**It is NOT a script-tag or a static React `<Widget/>` component.** Blink ships a JS SDK that opens
Blink's **hosted deposit flow inside a modal iframe overlay** (full-screen on mobile <=480px). You
call a method to launch it; you do not render the payment UI yourself.

- **npm package (web):** `@swype-org/deposit`
- **Mobile (React Native / native):** `@swype-org/deposit-mobile` (in-app browser + deep-link callback)
- **React entry point:** `@swype-org/deposit/react` exposing the **`useBlinkDeposit()`** hook
- **Plain JS entry point:** `Deposit` class from `@swype-org/deposit`

Install: `npm install @swype-org/deposit`

Minimal embed snippet location:
- Quickstart: https://docs.blink.cash/quickstart  (steps 1–3, full working flow)
- Deposit SDK page: https://docs.blink.cash/integration/deposit-sdk  (JS + React hook + config)

Minimal JS:
```ts
import { Deposit } from '@swype-org/deposit';
const deposit = new Deposit({ signer: '/api/sign-payment' });
await deposit.requestDeposit({
  amount: 50,
  chainId: 8453,                                       // Base
  address: '0x...userWallet',                          // destination (dynamic, per-user)
  token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
});
```

Minimal React:
```tsx
import { useBlinkDeposit } from '@swype-org/deposit/react';
const { status, result, error, displayMessage, requestDeposit } =
  useBlinkDeposit({ signer: '/api/sign-payment' });
// requestDeposit({ amount, chainId, address, token })
```

Config options (`webviewBaseUrl` default `https://pay.blink.cash`, `containerElement`,
`signerTimeoutMs` 15000, `flowTimeoutMs`, `debug`). Lifecycle: `close()`, `destroy()`.

---

## 2. Where/how do you get an API key / client key?

**Blink does NOT use an API key or a client key, and there is no self-serve dashboard.**
Auth uses a **signed-link model**: you generate an **ECDSA P-256 (prime256v1 / SHA-256) key pair**,
keep the private key on your server, register the public key with Blink, and your server signs every
deposit payload. Blink verifies the signature against your registered public key.

What you actually need instead of an API key:
1. **Generate a key pair** — https://docs.blink.cash/integration/key-generation
   `openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -out private.pem`
2. **Register the merchant** (get a `merchantId`) — https://docs.blink.cash/integration/merchant-registration
   - Self-serve API: `POST https://api.blink.cash/v1/merchants/applications` (send email, domain,
     publicKey PEM, description). Returns a reserved `merchantId` immediately (status `PENDING`).
   - OR book a call: https://calendar.app.google/3fqK5VntM89fFXnJ9 ; contact `s@blink.cash`.
   - The `merchantId` stays inert (`MERCHANT_NOT_REGISTERED` on verify) until a Blink operator
     manually approves it. Approval confirmation comes out-of-band (email/Telegram).
3. **Signer endpoint** — your server signs payloads with the private key + `merchantId`:
   https://docs.blink.cash/integration/signer-endpoint

**Dashboard URL: none documented.** There is no console/dashboard for self-issuing keys; the
"credential" is your key pair + an operator-approved `merchantId`. The API base is `api.blink.cash`,
the hosted payment app is `pay.blink.cash`.

> HACKATHON FLAG: merchant approval is a **manual human step**. The reserved `merchantId` works for
> wiring code but signed links FAIL verification until approved. Apply early / book the call to avoid
> being blocked during the event.

---

## 3. Networks, tokens, and sandbox/testnet

Source: https://docs.blink.cash/integration/supported-networks-and-wallets

- **Destination chains:** very broad — 69+ networks. EVM (Ethereum `1`, Base `8453`, Arbitrum `42161`,
  Optimism `10`, Polygon `137`, BNB `56`, Avalanche, zkSync, Linea, Unichain, etc.) **plus non-EVM**:
  Solana (`792703809`), Bitcoin (`8253038`), Tron (`728126428`), Eclipse, Soon. Per-chain token
  support is `All` or `Limited`. Routing/liquidity via Relay (`api.relay.link/chains`).
- **Common destination tokens:** USDC, USDT, ETH, native gas tokens, cbBTC/WBTC, SOL, PYUSD, etc.
  (USDC widely available; e.g. USDC on Base = `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`,
  USDC SPL mint on Solana = `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`).
- **Testnet chain IDs listed** (Base Sepolia `84532`, Sepolia `11155111`, Hyperliquid Testnet `1337`,
  Tempo Testnet `42431`) — these are routing destinations, NOT a Blink sandbox.
- **Source wallets:** MetaMask, Coinbase Wallet, Trust, OKX, Phantom (Solana + EVM), Rabby,
  WalletConnect (almost any other). Source stablecoins: USDC/USDT on ETH/Base/Arbitrum/Polygon/BNB.

### Sandbox / testnet mode: **NO.**
> From https://docs.blink.cash/integration/testing :
> "Blink runs on **mainnet only. There is no sandbox or testnet flow**, so verify your integration
> with a real deposit using a small amount of real funds."
Only a `debug: true` flag exists (verbose `[BlinkDeposit]` console logging) — not a test environment.

> HACKATHON FLAG: no sandbox = end-to-end testing requires **real funds** (small amounts). Budget a
> few dollars of USDC for live verification.

---

## 4. Arbitrary destination address + Dynamic compatibility

**Yes — the destination is fully arbitrary and set per-transaction.** `requestDeposit({ address, chainId, token })`
takes any destination wallet address (EVM `0x...` or Solana Base58, matched to the chain). Docs
explicitly state destination `chainId`/`address`/`token` are **not** static merchant config — they're
"set dynamically per transaction, typically based on the user's embedded wallet."
(https://docs.blink.cash/integration/deposit-sdk — Deposit request fields + Info callouts.)

**Dynamic is explicitly supported.** Docs name Dynamic as a first-class embedded-wallet source and
give the exact address hook:
- `@dynamic-labs/sdk-react-core` → `useDynamicContext().primaryWallet?.address`
  (from https://docs.blink.cash/ai-agent and llms-full.txt)
- Marketing/intro copy: "We work on top of wallet infrastructure like Privy, Turnkey, and **Dynamic**,
  and help your users fund those wallets in one tap."
- Other supported wallet-address sources: Privy (`useWallets()[0].address`), wagmi/RainbowKit
  (`useAccount().address`), WalletConnect/viem.

**Integration pattern for us:** read the Dynamic embedded wallet address via
`useDynamicContext().primaryWallet?.address`, pass it as `address` to `requestDeposit()` along with
the target `chainId` + `token`. No special Blink<->Dynamic glue required.

---

## Key URLs (cite these)
- Index: https://docs.blink.cash/llms.txt  /  Full: https://docs.blink.cash/llms-full.txt
- Quickstart: https://docs.blink.cash/quickstart
- Deposit SDK (web): https://docs.blink.cash/integration/deposit-sdk
- Mobile SDK: https://docs.blink.cash/integration/deposit-mobile-sdk
- Architecture / signed-link model: https://docs.blink.cash/integration/architecture
- Key generation: https://docs.blink.cash/integration/key-generation
- Merchant registration: https://docs.blink.cash/integration/merchant-registration
- Signer endpoint: https://docs.blink.cash/integration/signer-endpoint
- Supported networks/wallets: https://docs.blink.cash/integration/supported-networks-and-wallets
- Testing (no sandbox): https://docs.blink.cash/integration/testing
- AI-agent scaffold prompt: https://raw.githubusercontent.com/swype-org/docs/refs/heads/main/prompts/integrate-blink.md

## РЕЗУЛЬТАТ ТЕСТА 4 (build) — готово к клику, ожидание merchantId
- Страница `app/app/blink/page.tsx` + signer `app/app/api/sign-payment/route.ts` собраны, tsc OK, /blink отдаёт 200.
- Target = адрес Dynamic embedded-кошелька (`useDynamicContext().primaryWallet.address`). Chain=Base(8453), token=USDC.
- Сгенерирована P-256 пара: `app/blink-public.pem` (регистрировать в Blink), `app/blink-private.pem` (секрет, в .gitignore).
- Signer реализован по доке (base64url payload → ECDSA P-256/SHA256 → base64url подпись, idempotencyKey, signatureTimestamp).
- ⛔ Чтобы модалка реально открылась/прошла верификацию подписи — нужен **approved merchantId** (`POST api.blink.cash/v1/merchants/applications` + ручной аппрув оператором). Sandbox/testnet НЕТ → реальный депозит = реальные USDC. Вердикт: PARTIAL (render-only).

## Merchant application (submitted 2026-06-11)
- applicationId: 6317ab5c-cd18-42d5-9809-649bb692e294
- **merchantId (PENDING): 81172dcf-502e-4be4-b99c-2bc5c476df5f**
- email vadim@evacodes.com, domain justify.market. Ждём ручной аппрув оператора (out-of-band). До аппрува подпись отдаёт MERCHANT_NOT_REGISTERED.
