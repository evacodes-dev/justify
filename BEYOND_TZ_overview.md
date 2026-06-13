# Justify showcase — что сделано ПОВЕРХ исходного ТЗ

Документ для агента, который пишет боевое техническое ТЗ. Описывает дельту между исходным showcase-ТЗ и тем, что реально построено + развёрнуто, плюс технические находки и долги.

> Live demo: **https://88.198.118.236.nip.io** (Hetzner, HTTPS). Код: `~/hack-sandbox/app/` (Next.js, throwaway). Грабли: `~/hack-sandbox/showcase/SHOWCASE_NOTES.md`. Per-integration NOTES: `d:\GitHub\hackaton\sandbox-artifacts\*-NOTES.md`.

---

## 0. Стек интеграций (всё проверено вживую, есть on-chain tx)
Dynamic (login + embedded wallet) · Arc testnet (рынки, нативный USDC) · World ID 4.0 · ENS (mainnet) · Chainlink CRE (симуляция) · Anthropic Claude (AI-агент + LLM-резолюция) · Blink (render-only).

---

## 1. Что было в исходном ТЗ (baseline)
Кликабельная витрина с живыми интеграциями: фид бинарных рынков, онбординг (World ID → ENS-имя), 3 примитивных DemoMarket на Arc с реальными ставками, AI-агент (cron → ставка), CRE-симуляция, LLM-резолюция, ENS-репутация. Страницы: /showcase, /agents, /leaderboard, /market/[id], /portfolio. Часть фич — мок (Flow-депозит, CPMM-математика, лишние рынки фида).

---

## 2. СДЕЛАНО СВЕРХ ТЗ (главное)

### 2.1 Лендинг justify.market → в наш апп
- Воссоздан лендинг justify.market как страница `/` нативно в Next.js (их собранный HTML с CDN-бандлом вставить нельзя — сломался бы): герой «opinions become currency», 4 ролевые карточки (Creator/Trader/LP/Investor), секция стека, футер с цитатой основателя.
- «Connect Wallet» = реальный Dynamic-логин; «View DEMO» → живой апп `/showcase`. Тёмная тема под бренд.

### 2.2 Соц-слой: лайки + комментарии + World ID-гейт
- Лайки на карточках рынков и на странице рынка (тоггл, счётчик).
- Комментарии на `/market/[id]` — **только World ID-верифицированным** (one human, one voice): без верификации → 403 + подсказка; автор комментария = ENS-имя.
- Гейт связан с World ID: при прохождении верификации кошелёк пишется в verified-store, который проверяет соц-роут.

### 2.3 Агенты — настоящие сущности (а не общий кошелёк)
- Каждый созданный юзером агент получает СВОЙ сгенерированный кошелёк + дотацию с фаусета + ENS-личность (`name-bot.jstfy-demo.eth`) + пресет-стратегию (Value Hunter / News Sniper / Contrarian) и торгует своим кошельком.

### 2.4 Создание рынка из UI
- Реальный деплой нового `DemoMarket` на Arc серверным роутом → рынок появляется в живой ленте (динамический список, не только 3 фикс-рынка). Переход в созданные рынки `/market/100+` работает.

### 2.5 CRE вызывается из UI
- Кнопка «Run CRE simulation» на `/market/1` шеллит `cre workflow simulate` (ETH/USD → outcome) и показывает лог. CRE-воркфлоу ретаргетнут под DemoMarket #1 («ETH > $4000»): фид ETH/USD Sepolia, лог-строки, marketIds=[1].

### 2.6 Reverse-ENS + реестр имён
- Карточки резолвят адрес→ENS-имя: on-chain primary name (выставлен для owner-кошелька) + фоллбэк-реестр адрес→имя для embedded-кошельков (они не могут оплатить mainnet-газ для reverse-записи). Реестр пополняется автоматически при каждом минте.

### 2.7 ENS-репутация (живой getEnsText)
- После действий пишутся text-records `com.justify.accuracy` / `com.justify.pnl` одной tx; лидерборд (Humans) читает их живым `getEnsText` с mainnet.

### 2.8 Прочее сверх
- Единая навигация (Feed/Agents/Leaderboard/Portfolio) на всех страницах.
- Авто-дотация при логине (0.5 USDC одним нативным переводом = газ+актив).
- Проверка доступности ENS-имени (debounce) при онбординге.
- `/portfolio` с реальным `claim()` выигрыша.
- **Полный деплой на Hetzner** (Node22 + nginx + pm2 + Let's Encrypt SSL через nip.io).

---

## 3. Что ЖИВОЕ vs МОК (для планирования боевого)
**Живое (реальные tx):** Dynamic login+wallet · Arc approve+bet+claim · World ID 4.0 верификация · ENS минт/records/reverse/репутация (mainnet) · AI-агент (Haiku 4.5) → реальная ставка · LLM-резолюция (Sonnet 4.6) → resolve() на Arc · создание рынка (деплой) · CRE-симуляция · лайки/комменты.
**Мок (осознанно):** Flow-депозит (Dynamic Flow enterprise-gated) — НЕ сделан как отдельный экран; DemoMarket примитивный (фикс 50/50, shares 1:1) — FPMM писать с нуля; 5-6 рынков фида — фейк, кнопки выключены.
**Blink Deposit — ТЕПЕРЬ ЖИВОЙ:** merchantId `81172dcf…` **апрувнут** (API отдаёт наш публичный ключ, 200). Виджет рендерится, подпись (signed-link, P-256) проверяется, доходит до реальной формы депозита. Caveat: **mainnet-only** — завершение депозита требует реальных USDC.

---

## 4. КРИТИЧЕСКИЕ технические находки (обязательно в боевое ТЗ)
1. **ENS на Sepolia мёртв для НОВЫХ регистраций** (миграция на ENSv2): живой контроллер не использует классический NameWrapper, `register` ревертит `0x`. → **Все ENS на mainnet** (газ ~0.2 Gwei, субдомен+records ≈ $0.15).
2. **Родитель-имя должен быть WRAPPED в NameWrapper**, иначе субдомены пишут только labelhash → ENS-апп показывает `[hash].name.eth`.
3. **Embedded-кошелёк не ставит ENS reverse** (нет mainnet-газа) → реестр адрес→имя или спонсирование газа / L2-reverse (ENSIP-19).
4. **CRE НЕ пишет на Arc** (Arc не в списке CRE-сетей) → CRE = симуляция/верификация логики; фактический resolve делать отдельно (у нас LLM-роут + resolve на Arc). На питче честно разделять.
5. **`cre workflow simulate` спавнит `bun` напрямую** → нужен реальный `bun.exe`/`bun` в PATH (npm-шим не находится). Auth — `cre login` (браузер) или `CRE_API_KEY`, даже для `cre init`.
6. **Anthropic structured JSON** через `output_config.format` (json_schema), НЕ prefill (400 на 4.6+). **Грабля: nullable-enum в схеме = 400** — поля делать optional без null-union, дискриминатор (`action:"bet"|"skip"`). Haiku НЕ поддерживает `effort`/adaptive thinking. Модели: `claude-haiku-4-5` (агент), `claude-sonnet-4-6` (резолюция).
7. **Blink** — sandbox/testnet НЕТ (mainnet only) + merchantId ручной аппрув. **Dynamic Flow** — enterprise-gated (book-a-call).
8. **HTTPS обязателен** для Dynamic login + World ID/passkeys (secure context); по голому http://IP логин не работает. Для деплоя — домен + Let's Encrypt (использовали nip.io как бесплатный домен на IP).

---

## 5. Известные проблемы / долги (полу-заглушки)
- **admin-resolve берёт цену ETH для ВСЕХ рынков** — резолвя BTC/Fed-рынок, LLM получает нерелевантный ETH-контекст. Баг.
- **Flow-депозит не сделан** как отдельный мокап (по ТЗ должен быть «any chain → USDC on Arc · powered by Dynamic Flow»).
- **Blink Deposit → 404 без объяснения** — нужен дружелюбный «pending approval» экран.
- **CRE-запуск из UI** на сервере (Linux) не работает (шеллит Windows-`cre.exe`) — показывается захваченный лог.
- **World ID nullifier reuse ослаблен** (200 вместо 409) — намеренно для повторяемости демо, НЕ настоящая сайбил-защита.
- **Все сторы файловые JSON** (agents/feed/social/resolutions/created-markets/name-registry/verified) + **ключи агентов в plaintext** → в проде БД + KMS.
- **Лидерборд Humans** хардкод [vadym], репутация пишется вручную (нет авто после резолва/клейма).
- **Авто-дотация** in-memory granted сбрасывается при рестарте; фаусет ограничен (~16 USDC).
- **CRE-лог только у #1**; #2/#3/созданные — только LLM-резолюция.
- Мелочи: `/market/<несущ>` → 200 + клиентский «not found»; «Run agent now» в showcase берёт первого агента; создание рынка — emoji всегда 🎯, нет категории/картинки.

---

## 6. Архитектурные рекомендации для боевого ТЗ
- **Разделение слоёв (ключевой нарратив для призов):** идентичность/репутация → Ethereum mainnet (ENS), капитал/транзакции → Arc (нативный USDC). Адрес юзера одинаков в обеих EVM-сетях → имя резолвится из любой сети одним RPC-вызовом к Ethereum. Питч: «Identity on Ethereum · Funds on Arc» (Arc Chain-Abstracted + ENS призы).
- Frontend: транзакции через embedded-кошелёк на Arc; имена/аватары/репутация — отдельный mainnet read-client.
- AI: агент-цикл (cron) + LLM-резолюция как бэкенд-сервисы; строгий JSON-контракт; идемпотентность ставок.
- CRE: для верификации/отчётов; резолв-репорт бриджить/исполнять на поддерживаемой сети или дублировать оракулом.
- Безопасность: PK агентов и owner-ключ ENS — server-side/KMS; nullifier World ID в БД (UNIQUE на rp+action) для сайбил-защиты (в витрине намеренно ослаблено).
- Деплой: Node 22 + nginx + pm2 + домен + Let's Encrypt; HTTPS обязателен; добавить origin в Dynamic Allowed Origins.

---

## 7. Деплой (текущее состояние)
- Hetzner Ubuntu 22.04, 2 ядра / 3.7GB. Node 22 + nginx + pm2 (автозапуск) + certbot.
- Приложение в `/opt/justify`, под pm2 (`justify`), nginx reverse-proxy → :3000, HTTPS на `88.198.118.236.nip.io`.
- Обновление: новый билд локально → tar → scp → `npm ci && npm run build && pm2 reload justify`.
- **TODO руками:** добавить `https://88.198.118.236.nip.io` в Dynamic → Allowed Origins (иначе login по CORS падает).
