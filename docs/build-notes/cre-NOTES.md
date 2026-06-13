# CRE (Chainlink Runtime Environment) — Pre-Validation Notes

Compiled from official docs at docs.chain.link/cre on 2026-06-11.
Raw doc pages saved under `C:\Users\Вадим\hack-docs\cre\`.

Doc index: https://docs.chain.link/cre/llms.txt

---

## 1. Installing the CRE CLI

**Method: binary download. NOT npm, NOT `go install`, NOT brew.**
The CRE CLI (a.k.a. "Chainlink Developer Platform CLI") is a precompiled binary
distributed from GitHub releases. Two install routes:

- **Automatic (recommended):**
  - macOS / Linux: `curl -sSL https://app.chain.link/cre/install.sh | bash`
    (installs to `$HOME/.cre`)
    — https://docs.chain.link/cre/getting-started/cli-installation/macos-linux
  - Windows (PowerShell): `irm https://app.chain.link/cre/install.ps1 | iex`
    (installs to `$env:LOCALAPPDATA\Programs\cre`)
    — https://docs.chain.link/cre/getting-started/cli-installation/windows
- **Manual:** download the matching archive from
  https://github.com/smartcontractkit/cre-cli/releases
  (e.g. `cre_windows_amd64.zip`, `cre_darwin_arm64.zip`, `cre_linux_amd64.tar.gz`),
  verify SHA-256 checksum, extract, rename to `cre`/`cre.exe`, add to PATH.
  — same two install pages above.
- Verify with: `cre version` → prints `CRE CLI version <semver>`.

**Does it require Go installed? NO — not for the CLI itself.**
The CLI is a standalone binary; nothing in the install docs requires a Go toolchain
to install or run `cre`. Go is only relevant if you choose to *author workflows in Go*
(the SDK has Go and TypeScript variants). `cre generate-bindings` is marked "Go only".
— https://docs.chain.link/cre/reference/cli

**Which version?** The docs/examples are pinned to CRE CLI **v1.6.1**
(value of `VERSIONS["cre-cli"].LATEST` referenced across the docs; the CLI Reference
says "use this version to ensure compatibility with the guides").
— https://docs.chain.link/cre/reference/cli
NOTE: The latest GitHub release of cre-cli is **v1.18.0** (github.com/smartcontractkit/cre-cli/releases).
The docs render `{CRE_CLI_VERSION}` as a template variable, so the exact pinned number
in the rendered page may differ from the v1.6.1 found in the docs' VERSIONS table — confirm
with `cre version` after install, and prefer whatever the live install script pulls.

**TypeScript toolchain (Test 2 is TS):** TS workflows require **Bun >= 1.2.21**
(not Node — workflows compile to WASM and run in QuickJS, not Node.js).
Install deps with `bun install --cwd ./<project>/<workflow-dir>`.
— https://docs.chain.link/cre/templates/running-demo-workflow-ts
— https://docs.chain.link/cre/getting-started/before-you-build-ts

---

## 2. Official templates repo

Repo: **https://github.com/smartcontractkit/cre-templates** (MIT licensed).
Templates are fetched dynamically by `cre init` at runtime; only "Hello World" is
built into the CLI. Browse via `cre templates list`.
— https://docs.chain.link/cre/templates

Templates documented in the docs (curated subset):
- Building Blocks: `kv-store` (AWS S3 + SigV4 + secrets, read→write), `read-data-feeds` (onchain reads).
- Starter Templates: `custom-data-feed`, `bring-your-own-data` (NAV/PoR), `multi-chain-token-manager`.

Templates actually present in the live repo (from GitHub API, larger than docs list):
- starter-templates: `custom-data-feed`, `bring-your-own-data`, `multi-chain-token-manager`,
  `sports-resolution`, `event-reactor`, `keeper-bot`, `circuit-breaker`, `prediction-market`,
  `stablecoin-ace-ccip`, `tokenized-asset-servicing`, `vault-harvester`, `verifiable-build`.
- building-blocks: `kv-store`, `read-data-feeds`, `compression-utils`,
  `indexer-block-trigger`, `indexer-data-fetch`, `xml-utils`.

**Closest to "HTTP fetch -> EVM write": `starter-templates/custom-data-feed`.**
"Fetch custom off-chain data and push it on-chain using cron and log triggers."
It does exactly: cron trigger -> HTTP fetch of an external API (Proof-of-Reserve API)
-> EVM read -> EVM write of the result onchain (Sepolia). Has both Go and TS variants
(`cre-custom-data-feed-go`, `cre-custom-data-feed-ts`).
This is the same template the official "Running a Demo Workflow" guide walks through.
— github.com/smartcontractkit/cre-templates/tree/main/starter-templates/custom-data-feed
— https://docs.chain.link/cre/templates/running-demo-workflow-ts

---

## 3. Exact CLI command to simulate WITHOUT deploying

Simulation compiles the workflow to WASM and runs it locally on your machine —
it does NOT deploy. It does make REAL calls to public testnets + live HTTP endpoints.
— https://docs.chain.link/cre/guides/operations/simulating-workflows

Command:
```
cre workflow simulate <workflow-name-or-path> [flags]
```
Example (from the custom-data-feed demo, run from project root):
```
cre workflow simulate custom-data-feed --broadcast --target staging-settings
```

Key flags:
- By DEFAULT, onchain writes are a **dry run** (transaction prepared, NOT broadcast;
  shows tx hash `0x0000...`). No funded account needed for a pure dry run.
- `--broadcast` → actually sends the tx to the testnet (then a FUNDED wallet IS required).
- `--target <name>` (`-T`) → selects the config/RPC/secrets target (e.g. `staging-settings`).
- `--non-interactive` + `--trigger-index N` → headless mode (CI), N is 0-based handler index.
- HTTP trigger: `--http-payload '{...}'` or `--http-payload @file.json`.
- EVM log trigger: `--evm-tx-hash 0x... --evm-event-index 0`.
- `--engine-logs` (`-g`), `--verbose` (`-v`), `--limits` (enforce prod quotas).
— https://docs.chain.link/cre/guides/operations/simulating-workflows
— https://docs.chain.link/cre/reference/cli/workflow

To simulate WITHOUT any blockchain broadcast (safest, no funds needed):
omit `--broadcast`. The cron path still does HTTP fetch + EVM read + prepares the write.

---

## 4. What a simulation requires (user must provide)

From the "Prerequisites" of the simulation + demo guides:
— https://docs.chain.link/cre/guides/operations/simulating-workflows
— https://docs.chain.link/cre/templates/running-demo-workflow-ts

REQUIRED to run `cre workflow simulate` at all:
- **CRE account + login.** "You must have a CRE account and be logged in with the CLI."
  Run `cre login` (browser + email + password + OTP/2FA) or set `CRE_API_KEY`.
  GOTCHA: simulation lists account/auth as a prerequisite even though it runs locally.
- A valid project: run from project root (has `project.yaml`); the workflow dir needs
  a `workflow.yaml` pointing at code/config/secrets.
- **RPC URLs** configured in `project.yaml` for the target — REQUIRED if the workflow
  touches a blockchain (EVM read/write), or the simulator can't register the EVM
  capability and the run fails. Public Sepolia default offered by `cre init`:
  `https://ethereum-sepolia-rpc.publicnode.com`.

REQUIRED only for the EVM-write path:
- **Private key**: set `CRE_ETH_PRIVATE_KEY` in `.env` (64-char hex, NO `0x` prefix).
  Needed to sign onchain writes during simulation.
- **Funded account**: only when using `--broadcast` — the wallet must hold the chain's
  native token (e.g. Sepolia ETH from https://faucets.chain.link).
  Pure dry-run (no `--broadcast`) does NOT require funds.

API keys / secrets (for workflows that call authenticated APIs):
- Declare in `secrets.yaml`, supply values via `.env` or env vars. In simulation the
  CLI injects them locally — **no Vault DON needed**. (The custom-data-feed demo's
  Proof-of-Reserve API is public, so no API key is needed for that specific template.)
— https://docs.chain.link/cre/guides/workflow/secrets

For Test 2 (custom-data-feed TS, HTTP->EVM write) the user needs, at minimum:
1. CRE CLI installed + `cre login` (or CRE_API_KEY).
2. Bun >= 1.2.21, then `bun install --cwd ./<proj>/custom-data-feed`.
3. A Sepolia RPC URL in project.yaml (public default works).
4. `CRE_ETH_PRIVATE_KEY` in `.env` (a funded Sepolia key ONLY if running with `--broadcast`;
   for a dry-run a key is still set in the template `.env` but no funds are spent).

---

## 5. Known gotchas

- **Auth/login is required even for local simulation** (account is a stated prerequisite).
  `cre login` needs a browser + 2FA/OTP; not available in `--non-interactive` mode —
  use `CRE_API_KEY` for headless. — /cre/reference/cli/authentication
- **Deploying (not simulating) requires Early Access approval.** `cre account access`
  to check/request. API-key auth also requires that approval. Simulation does NOT
  require deploy access. — /cre/getting-started/before-you-build-ts, /cre/reference/cli/authentication
- **TS runs in QuickJS/WASM, not Node.** NPM packages relying on `node:crypto`/`node:fs`
  fail. Use viem `parseUnits`/`formatUnits` and `bigint` literals; use `runtime.now()`
  not `Date.now()`. — /cre/getting-started/before-you-build-ts
- **Bun is the TS package manager/runtime**, not npm/yarn; install per-workflow with `--cwd`.
- **`--broadcast` sends real testnet txs** and needs a funded wallet; without it writes are
  dry runs reporting a zero tx hash. — /cre/guides/operations/simulating-workflows
- **Simulation makes real network calls** to public testnets + live HTTP endpoints
  (not fully offline/mocked). A bad/missing RPC makes EVM workflows fail.
- **Version mismatch risk**: docs pinned around cre-cli v1.6.1 but latest release is v1.18.0;
  CLI flags/commands could differ. Verify with `cre version` and `cre workflow simulate --help`.
- Non-standard verbs to know: `cre init` (scaffold), `cre templates list` (browse),
  `cre workflow simulate` (run locally), `cre workflow build` (compile only),
  `cre workflow deploy` (deploy), `cre update` (self-update).
- Credential files live in `~/.cre/` (`cre.yaml` = tokens, `context.yaml` = tenant config);
  keep out of version control. — /cre/reference/cli/authentication

---

## ПИВОТ по совету заказчика (2026-06-11)
- **Шаблон: брать из solution "Prediction Markets"** на app.chain.link/cre/discover (2 шаблона) вместо generic `custom-data-feed`. В `cre templates list` это `prediction-market-ts` ("Full prediction market lifecycle: create, resolve, dispute binary markets") + `sports-resolution-ts` ("bring-your-own-data" резолюция). Для приза Chainlink — их же use case.
- **CRE Skill для Claude склонирован** → `~/hack-docs/cre/skill/chainlink-cre-skill/` (репо `smartcontractkit/chainlink-agent-skills`, MIT). Это решает галлюцинации API: SKILL.md = decision layer, references/ грузить по нужде (project-scaffolding, simulation, domain-patterns[prediction markets], evm-client, triggers, http-client...). Гайдрейлы: всегда `--target`, симуляция перед деплоем, TS в QuickJS/WASM (не Node), `runtime.now()`/`runtime.Rand()`.
- **Auth: `cre login` через браузер** (юзер кликает). Запущен в фоне.

## РЕЗУЛЬТАТ ТЕСТА 2 — PASS ✅ (симуляция прошла)
- `cre login` (браузер) — ОК. whoami: kotovvadim1210@gmail.com, org_kFxdOStbz4cveOlL.
- `cre init -t prediction-market-ts` → 3 воркфлоу: market-creation, market-resolution, market-dispute. Демо-контракт PredictionMarket уже задеплоен на Sepolia.
- `bun install --cwd ./<workflow>` ×3 — ОК.
- **`cre workflow simulate market-resolution --target staging-settings --non-interactive --trigger-index 0`** → PASS:
  - компиляция в WASM, cron-триггер, чтение BTC/USD price feed на Sepolia ($63125.63), resolve рынков 0/1/2, chain-write = dry-run (tx `0x000..0`, "no tx hash returned" — это норм для dry-run).
  - Result: `"Resolved markets: 0, 1, 2"`. "Failed to cleanup beholder" в конце — безобидный teardown-warning.
- Это ЛУЧШЕ критерия PASS из ТЗ: вместо generic-шаблона прогнали профильный prediction-market resolution (наш модуль) с EVM read+write.

### 🔴 ГЛАВНАЯ ГРАБЛЯ (сожрёт время завтра)
- **`cre workflow simulate` спавнит `bun` напрямую** (child_process spawn без shell). `npm install -g bun` ставит `.cmd`-шим, который НЕ резолвится → `ENOENT spawn 'bun'`, build failed на WASM-шаге.
- ЛЕЧЕНИЕ: положить РЕАЛЬНЫЙ `bun.exe` в PATH. У нас он тут: `C:\Users\Вадим\AppData\Roaming\npm\node_modules\bun\bin\bun.exe`. Лучше — нативная установка bun (`bun.sh/install`) и перезапуск шелла. Проверка: `Get-Command bun.exe` должен резолвиться в .exe, а не .cmd/.ps1.
- Прочее: `--target` обязателен; для single-cron хватает `--non-interactive --trigger-index 0`; throwaway CRE_ETH_PRIVATE_KEY (64 hex, без 0x) достаточно для dry-run (средства не нужны без `--broadcast`).
- Деплой (не симуляция) требует `cre account access` (Early Access approval) — для приза достаточно симуляции.

## (старое) РЕЗУЛЬТАТ ТЕСТА 2 (в процессе) — BLOCKED на auth
- Установлено локально: **CRE CLI v1.18.0** (бинарь, `%LOCALAPPDATA%\Programs\cre\cre.exe`), **Bun 1.3.14**. Обе версии ОК.
  - ⚠️ Доки запинены на v1.6.1, поставилась v1.18.0 — флаги могут отличаться, но базовые команды (`init`, `templates`, `workflow simulate`) на месте.
- Шаблон HTTP→EVM-write определён: **`cre-custom-data-feed-ts`** (cron+http+log-trigger+chain-write, Sepolia). Бонус: есть `prediction-market-ts` и `sports-resolution-ts` — прямо под наш продукт.
- **ГЕЙТ (подтверждено эмпирически): даже `cre init` требует аутентификации.** `cre init ... ! You are not logged in`.
  - Non-interactive путь для агента: **`CRE_API_KEY`** (создаётся в app.chain.link → Account Settings). При установленном env-var логин в браузере НЕ нужен.
  - Симуляция dry-run (без `--broadcast`) средств НЕ тратит; Sepolia RPC публичный.
- Ждём `CRE_API_KEY` от пользователя → дальше: `cre init` шаблоном → `bun install` → `cre workflow simulate custom-data-feed` (dry-run).

## Source docs downloaded (in C:\Users\Вадим\hack-docs\cre\)
cli-installation-macos-linux.md, cli-installation-windows.md, cli-installation.md (stub),
cli-reference.md, cli-workflow.md, cli-authentication.md, cli-login.md, cli-utilities.md,
creating-account.md, account.md, simulating-workflows.md, templates.md,
running-demo-workflow-ts.md, before-you-build-ts.md, secrets.md, using-http-client.md,
http-capability.md, using-evm-client-ts.md, evm-read-write.md, sdk-overview-ts.md,
getting-started-overview.md, project-configuration-ts.md,
GITHUB-cre-templates-README.md, GITHUB-custom-data-feed-README.md

## SHOWCASE: CRE-ретаргет под DemoMarket #1 (ETH > $4000)
- В `market-resolution`: `priceFeedAddress` → ETH/USD Sepolia `0x694AA1769357215DE4FAC081bf1f309aDC325306`, `marketIdsToCheck:[1]`, лог-строки BTC→ETH + порог $4000.
- Симуляция: читает реальный ETH/USD ($1668.19) → лог `DemoMarket #1 "ETH > $4000" -> outcome = NO` → resolve dry-run. Result: "Resolved markets: 1".
- Лог сохранён в `app/cre-sim-log.txt`, отдаётся `/api/cre-log`, показывается на `/market/1`.
- Фактический resolve на Arc делает LLM-роут `/api/admin-resolve` (Claude Sonnet → resolve() на Arc).
