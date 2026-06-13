# Justify — SHOWCASE (витрина для команды)

⚠️ **Throwaway / scratch.** Боевой фронт в пятницу пишется заново в новом репо.
Переносить ЭТОТ код нельзя — переносим только **знание «как подключается»**.

## Где живёт / запуск
Один Next.js: `~/hack-sandbox/app/`.
```
cd ~/hack-sandbox/app
npm run dev      # http://localhost:3000/showcase
```
Нужен `.env.local` (см. ниже). Все секреты — server-only, в .gitignore.

## Страницы
- **/showcase** — фид: 3 живых рынка (Arc) + лента AI-агентов + мок-рынки. Хедер с навигацией + Dynamic login + Deposit (Blink).
- **/agents** — создание AI-агента (свой кошелёк + дотация + ENS) + запуск + активность.
- **/leaderboard** — Humans (живой getEnsText по vadym.jstfy-demo.eth) + Agents (PnL по ставкам).
- **/portfolio** — позиции по рынкам + реальный claim().
- **/market/[id]** — детали рынка; для #1 блок Resolution: CRE-лог симуляции + LLM-вердикт + resolve-tx.

## Что ЖИВОЕ (реальные вызовы/транзакции)
| Фича | Статус | Технология |
|---|---|---|
| Login + embedded wallet | РЕАЛЬНОЕ | Dynamic |
| Авто-дотация при логине (0.5 USDC) | РЕАЛЬНОЕ | Arc native USDC transfer |
| Ставки на 3 DemoMarket (approve+bet) | РЕАЛЬНОЕ, tx на Arcscan | Arc + DemoMarket.sol |
| Создание рынка (деплой контракта) | РЕАЛЬНОЕ | Arc deploy из роута |
| Онбординг World ID 4.0 | РЕАЛЬНОЕ (симулятор) | World ID |
| Минт ENS-имени `name.jstfy-demo.eth` | РЕАЛЬНОЕ (mainnet) | ENS (registry/NameWrapper) |
| AI-агент: решение → реальная ставка | РЕАЛЬНОЕ | Claude Haiku 4.5 + Arc |
| LLM-резолюция: вердикт → resolve() | РЕАЛЬНОЕ | Claude Sonnet 4.6 + Arc |
| ENS-репутация com.justify.accuracy/pnl | РЕАЛЬНОЕ (mainnet) | ENS setRecords / getEnsText |
| CRE-симуляция (ETH/USD → outcome) | РЕАЛЬНОЕ (dry-run) | Chainlink CRE |
| Deposit-виджет (Blink) | render-only | Blink (merchantId pending) |

## Что МОК (осознанно)
- Flow-депозит (ждёт enterprise-апрува Dynamic) — статичный мокап.
- 5-6 рынков фида (кроме 3 живых) — мок-данные, кнопки выключены («demo · mock»).
- CPMM-математика — DemoMarket фикс 50/50, shares 1:1 (FPMM пишется в пятницу).

## Идентичность ≠ сеть капитала (ключевой питч)
**ENS живёт ТОЛЬКО на Ethereum mainnet. На Arc деплоя ENS нет и не нужно.**
Имя резолвится из любой сети одним RPC-вызовом к Ethereum. Фронт так и работает:
**транзакции → Arc, имена/аватары/репутация → mainnet-клиент.** Адрес юзера в EVM
одинаков, поэтому `vadym.jstfy-demo.eth → 0xABC` валиден и для Ethereum, и для Arc.
- Бейдж в wallet-bar: «🪪 Identity on Ethereum (ENS) · Funds on Arc».
- Питч-формула: «номер телефона не лежит в WhatsApp — он один, мессенджеры разные».
- Два приза сразу: **Arc Chain-Abstracted** (идентичность абстрагирована от сети) + **ENS** (единый неймспейс поверх мультичейна).

## Демо-сценарий (по слоям = по спонсорам)
1. Логин (Dynamic) → авто-дотация. 2. Deposit-модал (Blink/Flow-мокап).
3. Онбординг: World ID (симулятор) → минт `vadym.jstfy-demo.eth`. 4. Ставка на живом рынке → tx Arcscan.
5. /agents: создать агента → его ENS `name-bot.jstfy-demo.eth` → Run → живая ставка с LLM-reasoning.
6. /market/1: CRE-симуляция (лог ETH/USD) → LLM-резолюция (resolve-tx).
7. Claim выигрыша → репутация в ENS → /leaderboard с живым getEnsText.
Проговаривать: Dynamic → Arc×2 → World → ENS×2 → Chainlink.

## .env.local (server-only)
```
NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID=...     # Dynamic
NEXT_PUBLIC_WORLD_APP_ID / RP_ID / ACTION  # World ID 4.0
RP_SIGNING_KEY=0x...                        # World ID RP-подпись (secp256k1)
BLINK_MERCHANT_ID=...                       # Blink (PENDING)
ARC_FAUCET_PK=0x...  ARC_RPC=...            # фаусет/owner DemoMarket
ENS_OWNER_PK=0x...  MAINNET_RPC=...  DEMO_PARENT=jstfy-demo.eth
ANTHROPIC_API_KEY=sk-ant-...                # AI агент + резолюция
```

См. также `SHOWCASE_NOTES.md` — грабли связки фронт→Arc и LLM-JSON.
