# ТЗ — ФРОНТЕНД (подключение логики к существующему UI)

**Контекст: сайт-копия justify.market уже сделан** — фронтендер перенёс HTML в React, дизайн и базовый UX готовы. Это ТЗ НЕ про «построй страницы», а про **«подключи логику к готовому UI + дорисуй то, чего в оригинальном justify не было» (агенты, reasoning-feed, anti-sybil, human-in-the-loop)**.

Variant A, ENS/ERC-8004 убраны. Все секреты на бэке. Сеть — Arc.

---

## ЧАСТЬ 1 — Подключить логику к СУЩЕСТВУЮЩЕМУ UI

То, что в UI уже нарисовано (рынки, фид, профиль, кнопки) — оживить реальными данными и транзакциями:

### Авторизация
- Кнопка Connect (которая в макете) → **Dynamic login** (DynamicContextProvider, embedded wallet, wagmi-коннектор, сеть Arc)
- ВАЖНО: добавить origin (nip.io домен) в Dynamic **Allowed Origins**, иначе login падает по CORS
- После логина — адрес/имя + баланс USDC на Arc в хедере

### Рынки и фид (данные с бэка/контрактов)
- Карточки рынков в фиде — заполнить из GET /markets (бэк): вопрос, «X% chance» (priceYes), объём, спарклайн
- Имена авторов/юзеров — из бэка (строки из БД, **НЕ ENS** — никакой ончейн-резолюции имён)
- Бейджи ✓ человек / 🤖 агент — по данным с бэка

### Ставка (трейд)
- Кнопки Buy YES/NO (в макете) → трейд-модал: сумма USDC → расчёт shares по FPMM-формуле на клиенте (est. payout, price impact) → **approve USDC + buy** на контракте Arc (юзер сам подписывает кошельком) → success с tx-ссылкой на Arc-эксплорер
- Позиция → в /portfolio

### Страница рынка
- График цены (recharts) из истории с бэка
- Resolved-рынок: блок Resolution — исход + обоснование (reason из контракта/бэка, CRE/LLM) + tx
- Комменты (если в макете есть) — только World ID verified; автор = имя
- Redeem у выигравших → redeem на контракте

### Создание рынка
- Форма (в макете) → гейт: не verified → онбординг (ниже) → createMarket на Arc

---

## ЧАСТЬ 2 — Онбординг (подключить World ID к существующему флоу)

Степпер (если в макете его нет — дорисовать модал):
1. **Verify human** — World ID 4.0 (IDKitRequestWidget, НЕ legacy; на деве симулятор) → proof → POST /onboard
2. **Claim name** — инпут имени, live-проверка доступности (debounce через бэк) → сохранение (бэк пишет в БД + registerCreator на Arc). **Без ENS-субдоменов** — просто имя в БД
3. **Готово** — verified, может создавать рынки

---

## ЧАСТЬ 3 — ДОРИСОВАТЬ (этого в оригинальном justify НЕ было)

Это новые экраны/компоненты — их в макете justify.market нет, делаем поверх в том же дизайне:

### /agents — управление AI-агентами (НОВОЕ, центральная фича)
- **Create Agent:** имя + выбор стратегии (пресеты Value Hunter / News Sniper / Contrarian + своё поле) + бюджет-слайдер → POST /agents
- После создания: агент в списке с 🤖, именем, бейджем **human-backed** (из AgentKit), тумблер active/pause
- **Anti-sybil счётчик (killer-критерий приза):** «You: 2/3 agents · 7/10 free trial bets used» — данthese с бэка, лимит НА ЧЕЛОВЕКА. Показать заметно
- Список своих агентов: PnL, accuracy, бюджет (использовано/осталось), последние решения

### Reasoning-feed (НОВОЕ — главный вау на демо)
Встроить в основной фид (или отдельная лента): каждое решение агента — карточка с:
- 🤖 имя агента + бейдж human-backed
- **Развёрнутая цепочка мыслей** (из LLM): какие данные смотрел, его вероятность vs рыночная, вывод + почему — reasoning моноширинно/выделенно
- Ставка X USDC + tx-ссылка на Arc-эксплорер
- Реакции: лайк / follow agent
- Лента реалтайм (поллинг GET /feed или SSE) — новые решения всплывают сверху, анимация появления. НЕ экономить на этом — это то, что цепляет судью

### Human-in-the-loop (НОВОЕ)
Если агент создал pending крупную ставку (> порога) → баннер/тост: «🤖 newsbot хочет поставить $25 на YES: [reasoning]. Approve?» → кнопка Approve (World ID) → POST /agents/:id/approve → агент исполняет

### /agents/[name] — профиль агента (НОВОЕ)
PnL, accuracy, бюджет, последние решения с reasoning, владелец (имя), стратегия (если открыта). (Fork strategy — если успеем)

### /leaderboard (если в макете нет — дорисовать)
Табы Humans / Agents: имя, accuracy, pnl, volume, markets. Данные GET /leaderboard (из БД)

### /deposit (подключить два rail'а)
- **Flow** — Dynamic Flow «any chain → USDC on Arc»
- **Blink** — BlinkDepositButton или своя кнопка → requestDeposit({amount, chainId:8453 (Base), address, token:USDC}) через бэк-signer (/deposit/blink/sign) → после успеха вызов /deposit/bridge (Base→Arc). Статусы этапов: «deposited on Base ✓» → «bridged to Arc ✓». Минимум $0.25 — не давать меньше

---

## Интеграции (тех-детали)
- **Dynamic:** провайдер, embedded wallet, wagmi, сеть Arc, origin в Allowed Origins
- **World ID:** IDKitRequestWidget 4.0, app_id/rp_id, proof → бэк
- **Blink:** @swype-org/deposit, signer:'/deposit/blink/sign', merchantId (публичный, ок на клиенте), requestDeposit ТОЛЬКО из обработчика клика (браузер блокирует iframe иначе), DepositError + getDisplayMessage
- **FPMM-расчёт** shares на клиенте для превью (формула из ТЗ контрактов — должна совпадать с контрактом!)

## НЕ делать
- Не переделывать существующий дизайн/вёрстку justify — он готов, только подключаем логику и дорисовываем новое в том же стиле
- localStorage/sessionStorage — состояние в React state
- Ончейн-резолюцию имён (ENS убран) — имена с бэка
- Мультиисходные рынки (только бинарные YES/NO)

## Грабли
- HTTPS обязателен (Dynamic + World ID secure context) — у вас nip.io + Let's Encrypt
- approve перед buy (две tx: approve USDC → buy)
- requestDeposit Blink только из клика
- viewport meta для мобилок

## Порядок работы
1. Подключить Dynamic login к существующей кнопке Connect
2. Оживить рынки/фид данными с бэка + трейд-модал (approve+buy, tx) на существующих карточках
3. Онбординг World ID → имя → creator (подключить к существующей форме создания)
4. **Дорисовать /agents** (создание + список + anti-sybil счётчик)
5. **Дорисовать reasoning-feed** в фиде (поллинг, анимация) — вау-фича
6. Human-in-the-loop approve + /agents/[name] + /leaderboard
7. /deposit (Flow + Blink с этапами)

## DoD (к демо)
- [ ] Существующий UI оживлён: login, рынки с данными, ставка с реальным tx на Arc
- [ ] Онбординг World ID → имя → создание рынка
- [ ] /agents: создание агента → 🤖 + имя + human-backed бейдж
- [ ] Reasoning-feed живой: решения агентов с цепочкой мыслей + tx, всплывают реалтайм
- [ ] Anti-sybil счётчик «N/M на человека» виден
- [ ] Human-in-the-loop approve работает
- [ ] Resolved-рынок с обоснованием + Redeem
- [ ] /deposit: Flow + Blink (хотя бы до Base, мост статусом)
