# SHOWCASE_NOTES — грабли (пригодятся в пятницу)

## Фронт → Arc (embedded wallet)
- **Arc прописывается кастомной EVM-сетью в DynamicContextProvider** (`overrides.evmNetworks`), иначе embedded-кошелёк не подпишет Arc-tx. chainId 5042002, nativeCurrency symbol USDC, 18 decimals.
- Подпись из embedded-кошелька: `await primaryWallet.switchNetwork(5042002)` → `const wc = await primaryWallet.getWalletClient()` → `wc.writeContract(...)`. Нужен guard `isEthereumWallet(primaryWallet)`.
- **USDC на Arc — нативный токен.** Дотация = ОДИН native value-transfer (`sendTransaction value`) даёт юзеру и газ, и актив для ставок (native-баланс == ERC-20 balanceOf @0x3600). Не нужно слать газ и токен отдельно.
- Баланс юзеру показывать через ERC-20 `balanceOf` (6 dec), не нативный (18 dec) — иначе цифры в 1e12 раз разойдутся.
- approve+transferFrom на @0x3600 работают (DemoMarket.bet через transferFrom). Подтверждено.

## LLM-JSON (Anthropic)
- **Строгий JSON — через `output_config.format` (json_schema)**, не prefill (prefill 400 на 4.6+). Первый text-блок = валидный JSON, `JSON.parse`.
- **Грабля: nullable enum в schema = 400.** `enum:["YES","NO",null]` с типом `["string","null"]` отвергается («Enum value 'YES' does not match declared type»). Решение: поля делать optional (не в required) без null-union, дискриминатор `action:"bet"|"skip"`.
- Модели: агент-цикл — `claude-haiku-4-5` (быстро/дёшево), резолюция — `claude-sonnet-4-6` (качество). Haiku НЕ поддерживает `effort`/adaptive thinking — не слать эти параметры.
- Anthropic SDK ставится (`@anthropic-ai/sdk`); `new Anthropic()` читает ANTHROPIC_API_KEY из env. Роуты — `runtime = "nodejs"`.

## ENS (mainnet)
- **Sepolia-регистрация v1 закрыта (ENSv2-миграция)** — все ENS-операции делаем на **mainnet**. Газ ~0.2 Gwei: субдомен+records ≈ $0.15.
- **Для красивого отображения имени в ENS-апп родитель должен быть WRAPPED** (NameWrapper). Unwrapped → субдомен пишет только labelhash → апп показывает `[hash].name.eth` (резолв при этом работает). Мы завернули `jstfy-demo.eth` (wrapETH2LD).
- ensjs: `createSubname({contract:'nameWrapper'|'registry'})` авто-выбор по wrap-статусу; `setRecords` (мультиколл) для text+addr; чтение — `getEnsText`/`getEnsAddress` (нужен `normalize()`), резолв через UniversalResolver из любой сети.
- Репутация: `setRecords` ключи `com.justify.accuracy`/`com.justify.pnl` одной tx; лидерборд читает живым `getEnsText`.

## Chainlink CRE
- **`cre workflow simulate` спавнит `bun` напрямую** — npm-global bun (.cmd shim) НЕ находится → `ENOENT spawn 'bun'`. Нужен реальный `bun.exe` в PATH (`...\node_modules\bun\bin`). Лучше нативная установка bun.
- Auth — `cre login` (браузер) или `CRE_API_KEY`. Требуется даже для `cre init`/simulate.
- Симуляция dry-run (без `--broadcast`) — газ/средства не нужны, chain-write возвращает tx `0x000..0`.
- **CRE не пишет на Arc** (Arc не в списке CRE-сетей). В showcase CRE — симуляция (читает ETH/USD Sepolia-фид → выносит outcome); фактический resolve делает LLM-админ-скрипт на Arc. На питче говорить это честно.
- Ретаргет = поменять `priceFeedAddress` (ETH/USD Sepolia `0x694AA1769357215DE4FAC081bf1f309aDC325306`) + `marketIdsToCheck:[1]` + лог-строки.
- **CRE Skill** (`smartcontractkit/chainlink-agent-skills`) склонирован в `~/hack-docs/cre/skill/` — лечит галлюцинации API, грузить references по нужде.

## Прочее
- DemoMarket — НАМЕРЕННО примитивный (фикс 50/50, parimutuel). НЕ улучшать до боевого FPMM (это витрина).
- Blink: sandbox/testnet НЕТ (mainnet only) + merchantId ждёт ручного аппрува → реальный депозит сегодня заблокирован, виджет render-only.
- Dynamic Flow — enterprise-gated (book-a-call), в showcase мок.
- In-memory/файловые сторы (agents.json, agent-feed.json, resolutions.json, created-markets.json) — для витрины ок, в пятницу → БД.
