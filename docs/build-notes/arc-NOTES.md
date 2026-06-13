# Arc Testnet — NOTES

## Network config (из docs.arc.io)
| Параметр | Значение |
|---|---|
| Chain ID | **5042002** |
| RPC (primary) | `https://rpc.testnet.arc.network` |
| WSS | `wss://rpc.testnet.arc.network` |
| Currency symbol | **USDC** |
| Explorer | https://testnet.arcscan.app |
| Faucet | https://faucet.circle.com (даёт 10 USDC) |

Альт. RPC: Blockdaemon / dRPC / QuickNode (`rpc.<provider>.testnet.arc.network`).

## Газ
- **USDC — нативный газовый токен.** Не ETH. Платится газ в USDC.
- Внутренний учёт нативного токена — **18 decimals**. ERC-20 интерфейс USDC — **6 decimals**. Это ОДИН и тот же баланс, не два токена.
- EIP-1559 + EWMA-сглаживание базовой комиссии. Min base fee (testnet): **20 Gwei**. Max base fee ~1e-3 USDC. Target ~$0.01/tx.
- Рекомендация доков: ставить `maxFeePerGas` ≥ 20 Gwei. Кошельки без поддержки кастомного газ-токена могут показывать баланс как "ETH" — это всё равно USDC.

## USDC / контракты (Arc Testnet)
| Токен/контракт | Адрес |
|---|---|
| **USDC** (ERC-20 интерфейс к нативному балансу, 6 dec) | `0x3600000000000000000000000000000000000000` |
| EURC (6 dec) | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| CCTP TokenMessengerV2 (domain 26) | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |
| CCTP MessageTransmitterV2 | `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275` |
| Gateway Wallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |

CCTP domain Arc = **26**.

## EVM-совместимость
- Базлайн **Osaka** hard fork + часть Amsterdam-фич. Консенсус Malachite (Tendermint BFT), финальность <1 c.
- **`SELFDESTRUCT` запрещён при деплое** (чтобы не сжечь нативный токен). Обычный Counter.sol это не задевает.
- `PREVRANDAO` всегда 0 (нет он-чейн рандома!). EIP-4844 блобы выключены.
- **Вывод: стандартный Solidity деплоится без модификаций.** Foundry/Hardhat/Viem поддерживаются.

## Как платить газ при forge create
- Стандартный `forge create --rpc-url <arc> --private-key <pk>` должен работать; газ спишется в USDC с баланса.
- Если EIP-1559 оценка кривая — добавить `--legacy` или явный `--gas-price`/`maxFeePerGas` ≥ 20 Gwei.

## Перевод USDC
- Т.к. USDC нативный, перевод = либо нативный value-transfer (`cast send <to> --value <amount>`), либо ERC-20 `transfer` через `0x3600...0000`.

## Верификация контракта
- arcscan = **Blockscout** (живой `api/v2/`). Верификация: `forge verify-contract <addr> src/Counter.sol:Counter --verifier blockscout --verifier-url https://testnet.arcscan.app/api/`. (Подтверждено косвенно: v2 API отвечает; саму верификацию не гоняли — не нужна для PASS.)

## РЕЗУЛЬТАТ ТЕСТА 1 — PASS ✅
Стандартный Foundry-флоу прошёл БЕЗ модификаций.
- Counter задеплоен: `0xF80F25d2614624d2b65A3cb8bAebDcfB21FF9C0B`
  - deploy tx: `0xc94b968fc0076f92bb10a0c0a2f0aef9bf62d974a1582e2a78236506bf1a237f` (block 46564299, success в explorer)
- increment(): number 0 → 1
  - tx: `0x5ce3796f2966aa614a2f2e324a836b59c603bb6d9d6fe32cff9e7209b395fa7e`
- Перевод USDC на `0xd00042AfBf9C1D2543338D1161ccA1C85F7bAB1b`:
  - native value-transfer 1 USDC: `0x2875ab2918be0806d5cdb301941de4d7c40bd3f868456a9cee310e3c9817e3c3`
  - ERC-20 transfer @0x3600 1 USDC: `0x2619786f7bbd9a901c5df3f97c0bee5a8e692d0611ccec8ee795ac9fe73ac8f0`
  - итог у получателя: **2 USDC** (оба перевода легли на ОДИН баланс)

## ГРАБЛИ / на заметку для хакатона
1. **USDC нативный + ERC-20 @0x3600 — это ОДИН баланс.** Не два токена. Native `--value` и `transfer()` двигают то же самое. Не запутаться в demo-логике балансов.
2. **Decimals: 18 (нативный) vs 6 (ERC-20 интерфейс).** При показе баланса юзеру в UI бери ERC-20 `balanceOf` (6 dec), а не нативный (18 dec), иначе цифры в 1e12 раз разойдутся.
3. **PREVRANDAO всегда 0** — он-чейн рандома НЕТ. Если рынку нужен рандом — только оракул/VRF, не block.prevrandao.
4. **SELFDESTRUCT запрещён при деплое** — не критично для обычных контрактов.
5. Min base fee 20 Gwei, стандартный EIP-1559 оценщик forge работает; `--legacy` не понадобился.

## Что нужно было от пользователя (выполнено)
- Профинансировать адрес через https://faucet.circle.com (получено 20 USDC). Адреса сгенерированы локально (см. .env).

## SHOWCASE: DemoMarket.sol (примитивный, для витрины — НЕ боевой)
Задеплоено 3 шт на Arc testnet с фаусетного кошелька 0x199D…F578:
- #1 (CRE-цель): `0x6f314CD6a9A0fc6836F9d960fc694b6e4aE418b7` — "Will ETH close above $4000 on Jun 30 2026?"
- #2: `0xDb57F739A59aa9e18a765e8D09F8c82cc6B8229A` — "Will BTC close above $200k in 2026?"
- #3: `0xa21dc273e736848750E105D64846614443070C80` — "Will the Fed cut rates at the next meeting?"
Интерфейс: bet(uint8 side,uint256 amount) [нужен approve], resolve(uint8) onlyOwner, claim(), pools(), stakeOf(addr), previewPayout(addr). Парные выплаты (parimutuel).
**ВАЛИДАЦИЯ:** approve на USDC 0x3600 + bet работают (transferFrom двигает нативный USDC). Смоук: ставка 0.2 USDC на #1 прошла (pools=(0,0.2), tx status 0x1). → живые ставки из фронта реальны.
Owner всех маркетов = фаусетный кошелёк 0x199D…F578 (он же resolve/дотации).
