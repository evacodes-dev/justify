# Handoff: что сделано сверх showcase-ТЗ + находки для боевого ТЗ

Контекст: построена кликабельная витрина (Next.js, throwaway) + проведена предхак-валидация 7 интеграций. Ниже — что вышло за рамки исходного showcase-ТЗ и что КРИТИЧНО заложить в техническое ТЗ для разработчиков.

## A. Стек — что РЕАЛЬНО работает (проверено вживую, есть tx)
- **Dynamic**: email/social логин + embedded EVM-кошелёк. Arc прописан кастомной EVM-сетью в провайдере; подпись — `switchNetwork(5042002)` → `getWalletClient()`.
- **Arc testnet**: деплой контрактов (Foundry без модификаций), approve+bet через нативный USDC. **USDC — нативный газ И актив одновременно**; один native value-transfer даёт юзеру и газ, и ставку (native-баланс == ERC-20 `balanceOf` @0x3600).
- **World ID 4.0** (не legacy v2): RP-подпись на бэке (`signRequest`, secp256k1) → `IDKitRequestWidget` (staging) → симулятор → `/api/v4/verify/{rp_id}` → nullifier.
- **ENS на mainnet**: минт субдоменов `name.jstfy-demo.eth`, text-records, reverse-резолюция, репутация `com.justify.accuracy/pnl`.
- **Chainlink CRE**: симуляция prediction-market workflow (читает ETH/USD фид → outcome, dry-run).
- **Anthropic (Claude)**: AI-агент (Haiku 4.5) и LLM-резолюция (Sonnet 4.6), строгий JSON.

## B. Сделано СВЕРХ showcase-ТЗ
1. **Создание агента = настоящая сущность**: каждый агент получает СВОЙ сгенерированный кошелёк + дотацию с фаусета + ENS-личность (`name-bot.jstfy-demo.eth`) + пресет-стратегию; торгует своим кошельком.
2. **Создание рынка из UI**: реальный деплой нового `DemoMarket` на Arc серверным роутом → появляется в живой ленте (динамический список, не только 3 фикс-рынка).
3. **CRE вызывается из UI**: кнопка «Run CRE simulation» на `/market/1` шелл-аутит `cre workflow simulate` и показывает лог (в ТЗ — только CLI вручную).
4. **Reverse-ENS + реестр имён**: адрес→имя на карточках. On-chain primary name + фоллбэк-реестр для embedded-кошельков (они не могут оплатить mainnet-газ для reverse-записи).
5. **Проверка доступности имени** (debounce) + автоподстановка ENS-имён авторов рынков/агентов.
6. **Авто-дотация при логине** (0.5 USDC) одним нативным переводом.
7. Полный набор страниц с единой навигацией: фид, /agents, /leaderboard (живой getEnsText), /portfolio (claim), /market/[id] (CRE-лог + LLM-резолюция).

## C. КРИТИЧЕСКИЕ находки/грабли — обязательно в боевое ТЗ
1. **ENS на Sepolia мёртв для НОВЫХ регистраций** (миграция на ENSv2): живой контроллер не использует классический NameWrapper, `register` ревертит пустым `0x`. → **Все ENS-операции делать на Ethereum mainnet** (газ ~0.2 Gwei, субдомен+records ≈ $0.15). Старые v1-имена резолвятся, регистрировать нельзя.
2. **Родитель-имя должен быть WRAPPED в NameWrapper**, иначе субдомены пишут только labelhash → ENS-апп показывает `[hash].name.eth` (резолв при этом работает, но в UI некрасиво).
3. **Embedded-кошелёк не может выставить ENS reverse (primary name)** — он на Arc, нет mainnet-газа. → Нужен либо серверный реестр адрес→имя, либо спонсирование mainnet-газа, либо L2-reverse (ENSIP-19).
4. **CRE НЕ пишет на Arc** (Arc не в списке поддерживаемых CRE-сетей). → CRE = симуляция/верификация логики; фактический on-chain resolve делать отдельно (у нас — LLM-скрипт + signed report на Arc). На питче честно разделять.
5. **`cre workflow simulate` спавнит `bun` напрямую** — npm-global bun (.cmd shim) не находится (`ENOENT spawn 'bun'`), нужен реальный `bun.exe` в PATH. Auth — `cre login` (браузер) или `CRE_API_KEY`, требуется даже для `cre init`.
6. **Anthropic structured outputs**: строгий JSON через `output_config.format` (json_schema), НЕ prefill (400 на 4.6+). **Грабля: nullable-enum в схеме = 400** — поля делать optional без null-union, использовать дискриминатор (`action: "bet"|"skip"`). Haiku НЕ поддерживает `effort`/adaptive thinking. Модели: `claude-haiku-4-5` (агент), `claude-sonnet-4-6` (резолюция).
7. **Blink**: sandbox/testnet НЕТ (mainnet only) + merchantId требует ручного аппрува оператора → реальный депозит сегодня заблокирован. Подпись — signed-link (ECDSA P-256), без API-ключа.
8. **Dynamic Flow** — enterprise-gated (book-a-call), self-serve не включить; для депозитов это PARTIAL.

## D. Что осознанно МОК (для планирования боевого)
- DemoMarket — намеренно примитивный (фикс 50/50, parimutuel). **Боевой FPMM/CPMM писать с нуля** (в витрине shares 1:1).
- Flow-депозит — статичный мокап (ждёт enterprise-апрува).
- Часть рынков фида — мок-данные.
- Сторы — файловые JSON (agents/feed/resolutions/markets/name-registry). **В проде → БД**, ключи агентов → KMS/секрет-менеджер.

## E. Рекомендации для боевого ТЗ
- **Разделение слоёв (ключевой нарратив для призов)**: идентичность/репутация → Ethereum mainnet (ENS), капитал/транзакции → Arc (нативный USDC). Адрес юзера одинаков в обеих EVM-сетях → имя резолвится из любой сети одним RPC-вызовом к Ethereum. Питч: «Identity on Ethereum · Funds on Arc» (даёт Arc Chain-Abstracted + ENS призы).
- Frontend: транзакции через embedded-кошелёк на Arc; имена/аватары/репутация — отдельный mainnet read-client.
- AI: агент-цикл (cron) + LLM-резолюция как бэкенд-сервисы; строгий JSON-контракт; идемпотентность ставок.
- CRE: использовать для верификации/отчётов; резолв-репорт бриджить/исполнять на поддерживаемой сети или дублировать оракулом.
- Безопасность: PK агентов и owner-ключ ENS — только server-side/KMS; nullifier World ID хранить в БД (UNIQUE на rp+action) для сайбил-защиты (в витрине намеренно ослаблено для повторяемости).

Полные NOTES по каждой интеграции: `d:\GitHub\hackaton\sandbox-artifacts\*-NOTES.md`. Грабли витрины: `~/hack-sandbox/showcase/SHOWCASE_NOTES.md`.
