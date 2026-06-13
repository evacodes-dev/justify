# Депозитный слой — CCTP V2 мост Base → Arc (testnet)

Live: **https://88.198.118.236.nip.io/agents** → блок «🌉 Deposit from Base → Arc». Профиль `NETWORK=testnet`.

## Проверено вживую (не догадки)
- **Arc в CCTP V2, domain 26** — developers.circle.com/cctp/cctp-supported-blockchains. Base = domain 6.
- **Контракты реально задеплоены** (eth_getCode, байткод 2175 байт) НА ОБЕИХ сетях:
  - TokenMessengerV2 `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA`
  - MessageTransmitterV2 `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275`
- USDC: Base Sepolia `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, Arc testnet `0x3600…0000` (нативный, есть код).
- Iris sandbox `https://iris-api-sandbox.circle.com/v2/messages` — отвечает (fake hash → pending).

## Архитектура (один конфиг, переключение одной переменной)
- `lib/networks.ts` — **профили testnet/mainnet**, выбор через `NETWORK`. ВСЕ параметры тут: RPC, USDC, CCTP-контракты, Iris, explorer, chainId, domain. Mainnet-значения помечены MUST-VERIFY + env-override (Arc mainnet chainId/RPC/USDC ещё не подтверждены).
- `lib/cctp.ts` — **общая логика моста** (одна на обе сети): ABIs, `addrToBytes32`, `fetchAttestation` (Iris poll), `relayReceive` (receiveMessage на dest). Дублирования нет.
- Routes: `/api/bridge/config` (публичный профиль для клиента), `/api/bridge/attest` (poll Iris по txHash), `/api/bridge/relay` (receiveMessage на Arc, газ платит ARC_FAUCET_PK).
- UI: `app/agents/bridge.tsx` — `BridgeDeposit`: сумма + выбор агента-получателя → жжёт на Base из Dynamic-кошелька → поллит attestation → релеит mint на Arc → 2 tx-ссылки и таймлайн шагов.

## Поток (CCTP V2 burn-and-mint)
1. (клиент) `approve` USDC → `depositForBurn(amount, destDomain=26, mintRecipient=bytes32(agent), burnToken=USDC_base, destCaller=0, maxFee=0, finality=2000)` на Base → **burn tx**.
2. (сервер) poll Iris `/v2/messages/6?transactionHash=<tx>` → `message`+`attestation` когда `status=complete`.
3. (сервер) `receiveMessage(message, attestation)` на Arc MessageTransmitterV2 → USDC **минтится** агенту → **mint tx**. receiveMessage permissionless → юзеру газ на Arc не нужен.

## Что нужно для живого прогона (testnet, ≈$0)
- USDC на **Base Sepolia** в Dynamic-кошельке (faucet.circle.com) + немного Base Sepolia ETH на газ (бесплатный faucet).
- Реальных денег ~$0. Standard-перевод (~10-20 мин на hard-finality testnet; fast — отдельный режим с maxFee>0, не включал).

## Переключение на mainnet
`NETWORK=mainnet` + заполнить env: `ARC_MAINNET_RPC`, `ARC_MAINNET_CHAINID`, `ARC_MAINNET_USDC`, и сверить mainnet-адреса V2 (`BASE_TOKEN_MESSENGER_V2` и т.д.). Код не трогать.

## Где в демо
Блок на `/agents` НАД списком агентов: «положи USDC с Base — придёт на Arc-кошелёк агента». Это честный депозитный слой вместо faucet/«Fund +0.3» (которые остаются как быстрый путь).

## Ограничение
Полный e2e прогон (реальные 2 tx) не гонял — нужен твой Base Sepolia USDC + кошелёк. Все компоненты проверены по отдельности: контракты on-chain ✓, Iris ✓, config/routes ✓, tsc ✓.
