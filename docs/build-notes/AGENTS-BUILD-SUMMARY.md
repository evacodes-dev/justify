# «Афигенные агенты на боевом Justify» — что построено и задеплоено

Live: **https://88.198.118.236.nip.io/agents** (создание агента, апрувы, фид) и `/showcase` (reasoning-feed).
Дата сборки: 2026-06-13. Всё ниже — боевой код (Next.js 16, server routes, .env-секреты), задеплоено на Hetzner (pm2 + nginx).

## ✅ Сделано (всё в проде)

### Block 4 — качество решений агента (tested live)
- Агент берёт **данные по теме рынка** (`lib/market-intel.ts`): BTC-рынок → цена BTC, ETH → ETH, fed/rates → макро. Баг «всегда ETH» устранён.
- Структурный промпт: оценка истинной P(YES) → сравнение с market-implied → **edge = |est − implied|** → ставит только при edge ≥ 8pp и по стратегии, иначе skip.
- Модель **sonnet-4-6**, строгий JSON (discriminated `bet|skip|request_approval`).
- Проверено вживую: NO на «BTC>$200k», est 18% vs implied 56%, edge 38pp, реальная tx на Arc.

### Block 2 — reasoning-feed (карточки мыслей агента)
- `app/showcase/live.tsx` `ReasoningCard`: цепочка рассуждений (моноширинно), confidence-пилюля с цветом, **agent est % vs market % + edge**, дата-чипы (что смотрел), tx-ссылка, бейдж `human-backed`, анимация. Один общий компонент на `/showcase` и `/agents`.

### Block 1.3 — ERC-8004 (on-chain идентичность + репутация)
- `lib/erc8004.ts` — Identity Registry mainnet `0x8004A169…a432` (verified), register/giveFeedback/getSummary, CAIP-19 ref, chain-switchable (`ERC8004_CHAIN=base`).
- `app/api/agent-card/[addr]` — resolvable registration JSON (= `tokenURI`, кликается на Etherscan).
- `app/api/erc8004/register` — **явное действие** (кнопка, НЕ в цикле): register → agentId → привязка ENS-имени к agentId через ENSIP-26 text records. Idempotent.
- Репутация: `/api/reputation` теперь пишет ещё и **on-chain giveFeedback** (accuracy) при наличии agentId.
- UI: кнопка «Register ERC-8004» → бейдж `⬡ ERC-8004 #id` со ссылкой на Etherscan.
- **Симуляция против реального контракта (без траты):** agentId #34455, gas ~203k, ≈**$0.10** при 0.13 gwei. Signer (ENS_OWNER) держит ~0.0056 ETH — хватит на много агентов.

### Block 3.2 — human-in-the-loop (апрув крупных ставок через World ID)
- Ставки > `APPROVAL_THRESHOLD_USDC` (default 0.2) не исполняются сразу → попадают в очередь апрувов (`approvals.json`).
- `app/agents/approvals.tsx` — панель «Awaiting your approval»: **Approve with World ID** (наш staging app, симулятор-френдли) или Reject.
- `app/api/approvals/[id]` — approve **проверяет World ID-пруф** (Developer Portal) → только потом исполняет ставку из кошелька агента; reject закрывает. Reject протестирован e2e (фид пишет «Human REJECTED…»).

### Block 3.3 (бонус) — reflexion self-learning
- `lib/agent-memory.ts` — после резолва рынка (`admin-resolve`) пишем W/L каждому агенту, кто ставил.
- Перед след. решением `summarizeLessons()` вставляет трек-рекорд + калибровочный nudge («ты ниже 50% → ты переоценивал, тяни оценки к рынку») в промпт.
- UI: бейдж `📈 NW/NL` в строке агента.

### Anti-sybil (часть World-трека)
- `MAX_AGENTS_PER_OWNER` (default 3) — квота агентов на кошелёк-владелец, 429 при превышении. Owner пишется в agent при создании.

## ⏳ Ждёт твоего решения у стенда — Block 1.1 AgentKit ($7,500)
**Проверено по ИСХОДНИКУ CLI (не догадка):** регистрация в AgentBook жёстко зашивает **production** app_id `app_a7c3e2b6…` + action `agentbook-registration`, флаги только `--auto/--manual/API_URL`. **Dev/staging/simulator-обхода НЕТ** — симулятор работает только со staging-app_id. `--network base-sepolia` меняет лишь сеть записи, шаг World ID-пруфа тот же → нужен реальный World App.
- Вариант A: верифицируешься на **стенде World (Orb)** + World App → регистрирую агентов по-настоящему (gasless-реле уже описано) → Track A.
- Вариант B: World App нет → AgentKit на паузу. Track B ($2,500: онбординг-гейт + anti-sybil) и human-in-the-loop остаются — они на нашем World ID.
- x402 — **на паузе** (твоё решение).

## Демо-шаги (вручную, по 1 клику)
1. `/agents` → создать агента (кошелёк + ENS + фандинг faucet).
2. Кнопка **Register ERC-8004** (≈$0.10) → бейдж + ссылка на Etherscan (реальная on-chain идентичность).
3. **Run (real bet)** → reasoning-карточка в фиде (est vs market, edge, tx).
4. Если агент захочет ставку > 0.2 → появится в «Awaiting approval» → **Approve with World ID** (симулятор) → ставка исполняется.
5. Резолв рынка (`/showcase` admin-resolve) → у агента появляется `📈 W/L`, след. решения калибруются.

## Файлы (sandbox: C:\Users\Вадим\hack-sandbox\app)
- lib: `erc8004.ts`, `agent-exec.ts`, `agent-memory.ts`, `market-intel.ts`, `approvals-store.ts`, `arc.ts`, `claude.ts`, `feed-store.ts`, `agent-store.ts`
- routes: `agent-card/[addr]`, `erc8004/register`, `approvals/` + `approvals/[id]`, `agent/tick`, `agents`, `reputation`, `admin-resolve`
- ui: `agents/page.tsx`, `agents/approvals.tsx`, `showcase/live.tsx`, `showcase/showcase.css`
- notes: `sandbox-artifacts/ERC8004-BUILD-NOTES.md`, `app/AGENTKIT_NOTES.md`, `app/ERC8004_NOTES.md`
