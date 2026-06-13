# ТЗ — БЭКЕНД (Вадим)

Дорабатываем боевой бэкенд (Node/TS, Fastify, крутится на Hetzner). Variant A, ENS/ERC-8004 убраны. Хакатонные сокращения ОК (файловые JSON-сторы вместо Postgres — как в showcase), главное чтобы работало и tx были реальные.

## Архитектура
```
Fastify (роуты) + cron (агент-циклы) + индексер (поллер событий Arc)
Хранение: файловые JSON-сторы (users, agents, markets, trades, positions, reputation,
          feed, nullifiers, verified) — Postgres потом
Подписанты: VERIFIER_PK (Arc), BLINK_SIGNER (P-256), агентские ключи, FAUCET_PK (дотации)
```

## Эндпоинты

```
POST /onboard   { proof(WorldID 4.0), name, address, avatar? }
  1) verify World ID 4.0 (rp_id, signing key) → nullifier-дедуп (store nullifiers, UNIQUE rp+action)
  2) валидация name → сохранить внутреннее имя в БД (уникальность в нашей таблице, БЕЗ ончейна)
  3) газ-дотация юзеру на Arc (с FAUCET_PK)
  4) factory.registerCreator(address) на Arc (с VERIFIER_PK)
  5) пометить address verified в store
  → { ok, name, arcTx }

POST /agents   { name, strategyText|preset, budgetUsdc }   [требует verified-юзера]
  1) генерация server wallet агента (или Dynamic server wallet) + дотация газ/USDC на Arc
  2) внутреннее имя агента в БД (name + ownerHumanId, БЕЗ ончейн-реестра)
  3) AgentKit-регистрация агента в AgentBook (gasless, World relay) — proof-of-human привязка
  4) запись агента в store (strategy, budget, walletRef, ownerHumanId, active)
  → { ok, agentName, walletAddr }

GET  /markets, /markets/:id          — из store/индексера
GET  /profile/:name, /agents/:name   — профиль + репутация из store
GET  /leaderboard                    — Humans/Agents, репутация из store (accuracy/pnl)
GET  /feed                           — лента активности (ставки людей + агентов с reasoning)

POST /deposit/blink/sign  { amount, chainId, address, token, callbackScheme, url, version }
  → подпись base64url-payload ECDSA P-256/SHA-256, idempotencyKey(uuid v4), signatureTimestamp(ISO)
  → { merchantId, payload, signature, preview }
  (по доке Blink: подписывать base64url-СТРОКУ, не raw JSON; ключ MERCHANT_PRIVATE_KEY из env)

POST /deposit/bridge  { amount, fromTxOnBase }
  → инициирует Base→Arc через Circle Bridge Kit (CCTP Fast Transfer), трекинг статуса
  → { bridgeId, status }

POST /webhooks/flow   → статусы Dynamic Flow депозитов (если есть)

POST /agents/:id/approve  { decision }   — human-in-the-loop: апрув крупной ставки агента
```

## Индексер (поллер)
viem getLogs каждые 5 сек по событиям Arc: MarketCreated, Buy, Sell, Resolved, LiquidityAdded/Removed.
→ обновляет store: markets, trades, positions.
→ после Resolved: пересчёт репутации участников (accuracy = угаданные/всего, pnl) → запись в reputation store.
Без subgraph/ponder — простой поллер.

## Агент-цикл (cron, каждые N мин на активного агента)
```
1. читать открытые рынки + подтянуть данные ПО ТЕМЕ рынка (цена с Coingecko / новости)
   ВАЖНО: тема из market.metadataURI — НЕ давать цену ETH для BTC/Fed/спорт-рынков (баг showcase)
2. Anthropic Haiku 4.5, промпт = стратегия агента, строгий JSON:
   {action:"bet", marketId, side:"YES"|"NO", amountUsdc, confidence, reasoning, dataUsed[]}
   | {action:"skip", reasoning}
   | {action:"request_approval", marketId, side, amountUsdc, reasoning}   // если > порога (human-in-loop)
   output_config.format json_schema (НЕ prefill); БЕЗ nullable-enum; дискриминатор action
3. если bet: проверить anti-sybil квоту владельца → approve+buy с кошелька агента (в пределах бюджета,
   идемпотентно по marketId+cycle) → запись в feed с reasoning
4. если request_approval: создать pending, пуш владельцу, ждать /agents/:id/approve
5. стоп при исчерпании бюджета
```

## LLM-резолюция (сервис, дёргается по closeTime или из CRE)
```
Ценовые рынки: fetch цены → детерминированное сравнение → Resolver.resolve(id, outcome, "price=X vs target=Y")
Субъективные:  2-3 новостных источника → Anthropic Sonnet 4.6 →
               {outcome:"YES"|"NO"|"INVALID", reasoning, sources} → Resolver.resolve(id, outcome, reasoning)
ВАЖНО: контекст ПО ТЕМЕ рынка (баг showcase — давал ETH всем). reason пишется ОНЧЕЙН.
CRE не пишет на Arc — фактический resolve через наш Resolver-роут (VERIFIER_PK).
```

## Anti-sybil (через AgentKit) — killer-критерий приза World $7,500
- При создании агента / ставке агента: резолв agent-wallet → ownerHumanId (через AgentKit) → агрегированный счётчик НА ЧЕЛОВЕКА
- Квота: 1 человек = max N активных агентов + free-trial M ставок суммарно на всех его агентов
- Отдавать фронту счётчики для UI «You: 2/3 agents · 7/10 trial bets»

## AgentKit middleware
Эндпоинты, которые агенты дёргают для действий — обернуть `createAgentkitHooks` + `agentkitResourceServerExtension` (Next.js-совместимо), proof-of-human перед исполнением.

## Подписанты и безопасность
- VERIFIER_PK (registerCreator + resolve на Arc), BLINK_SIGNER (P-256), FAUCET_PK (дотации), агентские ключи
- p-queue на КАЖДЫЙ подписант (nonce collision при параллельных действиях агентов/онбордингов)
- Ключи из env (.gitignore), в проде KMS — пометить
- World ID nullifier: store с UNIQUE(rp, action). В showcase ослаблено до 200 для демо-повторов — для прода 409 на reuse
- Серверная верификация статуса депозита Blink — НЕ доверять клиентскому DepositResult (их production checklist)

## Блок депозитов (детали)
```
Flow: вебхук статуса → зачисление USDC юзеру на Arc (chain-abstraction Dynamic)
Blink: /deposit/blink/sign подписывает → фронт открывает Blink → USDC на Base (destination 8453)
       → /deposit/bridge инициирует Base→Arc через Bridge Kit (CCTP Fast Transfer)
       минимум депозита Blink $0.25 — мелкие дотации агентам НЕ через Blink (faucet), батчить крупные
CCTP: Bridge Kit (@circle-fin/bridge-kit), НЕ сырой CCTP. Arc domain 26, Base domain 6.
      Тестнет: Base Sepolia → Arc testnet, USDC из faucet.circle.com
```

## Грабли (учти)
- CRE не пишет на Arc → resolve через наш роут
- Anthropic: json_schema формат, без nullable-enum, дискриминатор action, Haiku без effort/thinking
- Модели: claude-haiku-4-5 (агент), claude-sonnet-4-6 (резолюция)
- HTTPS обязателен (Dynamic/World ID) — у вас уже nip.io + Let's Encrypt
- Тема рынка для LLM — из metadataURI, не дефолт ETH

## Порядок работы
1. /onboard (World ID verify → имя в БД → registerCreator → дотация) + индексер рынков
2. Агент-цикл (LLM решение → ставка → feed) + anti-sybil
3. LLM-резолюция (ценовые → субъективные) + reason ончейн
4. AgentKit регистрация + middleware
5. Депозиты: Flow → Blink signer → CCTP bridge
6. Репутация (пересчёт после Resolved) + лидерборд + human-in-the-loop approve

## Env
```
ANTHROPIC_API_KEY=
WORLD_APP_ID / WORLD_RP_ID / WORLD_SIGNING_KEY=
AGENTKIT_... (после npm i)
ARC_RPC_URL / ARC_USDC_ADDRESS / ARC_EURC_ADDRESS=
FACTORY_ADDRESS / RESOLVER_ADDRESS=   (от контрактов)
VERIFIER_PK=  FAUCET_PK=
BLINK_MERCHANT_ID=  BLINK_SIGNER_PRIVATE_KEY=   (P-256 PEM)
DYNAMIC_ENV_ID=   (если server wallets через Dynamic)
```
(ENS_OWNER_PK, ERC8004, ETH_MAINNET_RPC — НЕ нужны, ENS убран)
