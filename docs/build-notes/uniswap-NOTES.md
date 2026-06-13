# Uniswap Trading API — Pre-Validation Notes

Gathered 2026-06-11 for hackathon pre-validation. All facts taken from official Uniswap
developer docs. Doc URLs cited inline. Downloaded HTML in `C:\Users\Вадим\hack-docs\uniswap\`.

## РЕЗУЛЬТАТ ТЕСТА 7 — PASS ✅ (живой прогон 2026-06-11)
- `POST https://trade-api.gateway.uniswap.org/v1/quote`, headers `x-api-key: <key>` + `x-universal-router-version: 2.0`. HTTP 200.
- **Mainnet (chainId 1):** 0.01 ETH → **16.662213 USDC**, routing=CLASSIC, v4-pool, gasFeeUSD ~$0.04, priceImpact 0.06%.
- **Testnet ПОДДЕРЖИВАЕТСЯ:** Ethereum Sepolia (11155111) вернул живой CLASSIC-quote (0.01 ETH → 117.9 USDC, цена на тестнете кривая, но маршрут есть). → mainnet для tx hash НЕ обязателен.
  - Base Sepolia (84532) и Unichain Sepolia (1301) вернули пусто (вероятно адрес USDC/нет ликвидности). Использовать Ethereum Sepolia.
- **Native ETH = sentinel `0x0000000000000000000000000000000000000000`** (принят как tokenIn; в маршруте оборачивается в WETH). Для native input `permitData=null` — approve/Permit2 НЕ нужен.
- **Путь к исполнению (tx hash):** quote (CLASSIC) → `POST /v1/swap` возвращает `TransactionRequest` (to/data/value/gas) → подписать и забродкастить СВОИМ кошельком/RPC = tx hash. Для ERC-20 input сначала `/check_approval` (approve в Permit2) + подпись Permit2 EIP-712. UniswapX-маршруты идут через `/order` (gasless), не `/swap`.
- Ключ берётся на hub.uniswap.org → developers.uniswap.org/dashboard. Свой ключ работает.

> Note: `api-docs.uniswap.org` and `docs.uniswap.org/api/trading` now **301-redirect** to
> `developers.uniswap.org/docs/trading/...`. `hub.uniswap.org` also redirects there. That
> is the current canonical home for the hosted Trading (Swapping) API.

---

## 1. Quote endpoint, base URL, request body & auth

- **Base URL:** `https://trade-api.gateway.uniswap.org/v1`
- **Quote endpoint:** `POST /quote`  → full URL `https://trade-api.gateway.uniswap.org/v1/quote`
- **Auth header:** `x-api-key: YOUR_API_KEY` (required on every endpoint).
  Examples also send `x-universal-router-version: 2.0` and `Content-Type: application/json`.

### Request body (POST /quote)
| Field | Type | Req | Notes |
|-------|------|-----|-------|
| `type` | enum | yes | `EXACT_INPUT` or `EXACT_OUTPUT` |
| `amount` | string | yes | base units, > 0 (e.g. wei). For ETH->USDC EXACT_INPUT, amount = ETH wei in |
| `tokenIn` | string | yes | input token address |
| `tokenOut` | string | yes | output token address |
| `tokenInChainId` | int (enum) | yes | default 1 |
| `tokenOutChainId` | int (enum) | yes | default 1 (same as in for a plain swap) |
| `swapper` | string | yes | wallet address sending the tokens |
| `slippageTolerance` | number | no | max price change % |
| `autoSlippage` | enum | no | `DEFAULT` to auto-calc |
| `routingPreference` | enum | no | `BEST_PRICE` (default) or `FASTEST` |
| `protocols` | enum[] | no | V2 / V3 / V4 / UNISWAPX variants |
| `recipient` | string | no | output receiver, defaults to swapper |

### Example ETH -> USDC quote
```bash
curl --request POST \
  --url 'https://trade-api.gateway.uniswap.org/v1/quote' \
  --header 'x-api-key: YOUR_API_KEY' \
  --header 'x-universal-router-version: 2.0' \
  --header 'Content-Type: application/json' \
  --data '{
    "type": "EXACT_INPUT",
    "amount": "1000000000000000000",      // 1 ETH (wei)
    "tokenInChainId": 1,
    "tokenOutChainId": 1,
    "tokenIn":  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // native ETH sentinel
    "tokenOut": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC (mainnet)
    "swapper": "0xYourWallet",
    "slippageTolerance": 0.5
  }'
```
> Docs' own sample uses `tokenIn=USDC, tokenOut=WETH (0xC02a...756Cc2)`. For native ETH
> use the `0xEeee...EEeE` sentinel; confirm exact sentinel against the create_swap docs at
> integration time (FLAG: docs example uses WETH, not native ETH — worth a live test).

Source: https://developers.uniswap.org/docs/api-reference/aggregator_quote

---

## 2. Where to get the API key / free tier / rate limits

- **Developer Platform / dashboard:** `https://hub.uniswap.org/` (the "Uniswap Trading API"
  business landing) → create a free account → **API keys dashboard at
  `https://developers.uniswap.org/dashboard`**. Header nav link literally reads "API keys".
- Docs say: "Create a free account and get your own API keys from the dashboard."
- **Free tier / rate limits:** NOT documented on the public docs pages. No published rate-limit
  numbers found. (FLAG: rate limits and any quota are only visible after creating an account
  in the dashboard — verify there.)
- One swap-side minimum that is documented (this is a quote minimum, not an API rate limit):
  **UniswapX requires min quote value ~300 USDC on Mainnet, ~1,000 USDC on L2 (Arbitrum, Base).**
  Classic AMM routes do not have this minimum.

Sources: https://hub.uniswap.org/ , https://developers.uniswap.org/docs/trading/swapping-api/getting-started

---

## 3. Supported chains + TESTNET question (CRITICAL)

**TESTNET SUPPORT: YES.** The API is NOT mainnet-only. Three Sepolia testnets are accessible
via the API. (Note: only Ethereum Sepolia + Unichain Sepolia are exposed in the Uniswap *web
UI*, but the docs state **all listed testnets are accessible via the API**.)

### Testnets (chainId)
| ID | Chain |
|----|-------|
| 11155111 | Ethereum Sepolia |
| 84532 | Base Sepolia |
| 1301 | Unichain Sepolia |

### Mainnets (partial — 18+ chains, "25+ chains" per marketing)
1 Ethereum, 10 Optimism, 56 BNB Chain, 130 Unichain, 137 Polygon, 143 Monad, 196 X Layer,
324 zkSync, 480 World Chain, 1868 Soneium, 4217 Tempo, 8453 Base, 42161 Arbitrum,
42220 Celo, 43114 Avalanche, 59144 Linea, 81457 Blast, 7777777 Zora.

> For hackathon test runs on a testnet, **Ethereum Sepolia (11155111)** or **Base Sepolia
> (84532)** are the safest bets. Liquidity on testnets may be thin — confirm a real quote
> returns before relying on it.

Source: https://developers.uniswap.org/docs/trading/swapping-api/supported-chains

---

## 4. Execution flow — how to get a tx hash (NOT executing today, just documented)

The API returns **calldata**; you sign & broadcast with your own wallet/RPC. The API never
holds keys or submits your classic swap.

**Flow (Classic/AMM route, e.g. ETH->USDC):**

1. **(One-time) ERC20 approve to Permit2.** The swapping wallet must grant ERC-20 approval to
   the **Permit2 contract** once per token (persists indefinitely). Native ETH needs no approval.
   - `POST /check_approval` — returns approval **calldata only if approval is required**;
     send that tx on-chain first. Returns null/empty if already approved.
2. **`POST /quote`** — returns routing + quote. Response includes:
   - `routing`: `CLASSIC | DUTCH_V2 | DUTCH_V3 | PRIORITY | WRAP | UNWRAP | BRIDGE`
   - `permitData`: EIP-712 object if a Permit2 signature is needed (or `null`).
3. **Sign Permit2 (if `permitData` present):** EIP-712 off-chain signature:
   `signature = wallet._signTypedData(permitData.domain, permitData.types, permitData.values)`
4. **`POST /swap`** (for CLASSIC/WRAP/UNWRAP/BRIDGE) — body: `{ quote, permitData, signature, simulateTransaction? }`.
   Returns a `TransactionRequest`: `{ to, data, value, from, gasLimit, maxFeePerGas,
   maxPriorityFeePerGas, chainId }`. `data` is pre-validated calldata — do not modify; never empty.
   - For UniswapX routes (DUTCH_V2/DUTCH_V3/PRIORITY) you call **`POST /order`** instead of `/swap`
     (gasless, filled by market makers) — different path, no self-broadcast.
5. **Sign & broadcast** the returned TransactionRequest via your own RPC provider →
   **this is where you get the tx hash.**

Rule: include `quote` + `signature` + `permitData` together, or omit all three. Never send
signature without permitData or vice versa.

Sources:
- https://developers.uniswap.org/docs/trading/swapping-api/integration-guide
- https://developers.uniswap.org/docs/trading/swapping-api/concepts/permit2
- https://developers.uniswap.org/docs/api-reference/create_swap_transaction

---

## 5. Endpoint summary
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/check_approval` | POST | Returns ERC20->Permit2 approval calldata if needed |
| `/quote` | POST | Get routing + quote (+ permitData) |
| `/swap` | POST | Build classic swap TransactionRequest (calldata) |
| `/order` | POST | Submit gasless UniswapX order |

All under base `https://trade-api.gateway.uniswap.org/v1`, all require `x-api-key`.

---

## Open / unclear items (FLAGS)
- **No published rate limits / free-tier quota** in public docs — only visible in dashboard.
- **Native ETH sentinel address** for `tokenIn` not 100% confirmed from the pages read
  (docs sample used WETH). Verify the `0xEeee...EEeE` sentinel with a live quote call.
- **Testnet liquidity** likely thin; a quote may succeed but a swap may have poor/no route —
  test before depending on it.
