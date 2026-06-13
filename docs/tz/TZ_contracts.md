# ТЗ — СМАРТ-КОНТРАКТЫ (Вадим)

Дорабатываем боевой код (сейчас на Arc стоят примитивные DemoMarket 50/50). Задача — довести до настоящего FPMM-предикшн-маркета. Variant A, ENS/ERC-8004 убраны.

Стек: Solidity 0.8.24, Foundry, деплой на Arc testnet (chainId 5042002). Коллатерал USDC (6 decimals). reentrancy guard на функции с переводом USDC. Без прокси/апгрейдов.

## Решение по модели: FPMM с fallback
- **Цель: бинарный FPMM** (Gnosis-style, constant product) — живая цена, реальный prediction-market.
- **Fallback 50/50:** если по срокам FPMM не успеваешь — оставляешь текущий DemoMarket 50/50, но это аварийный вариант (судьи-трейдеры ждут живую цену). Приоритет — FPMM.

---

## Контракт 1: MarketFactory.sol

```solidity
interface IMarketFactory {
    event MarketCreated(uint256 indexed id, address market, address indexed creator, string question, uint64 closeTime);
    event CreatorRegistered(address indexed user);

    function setVerifier(address) external;            // onlyOwner — адрес бэкенда
    function registerCreator(address user) external;   // onlyVerifier (бэкенд после World ID)
    function isCreator(address) external view returns (bool);

    function createMarket(
        string calldata question,
        string calldata metadataURI,    // тема/категория/картинка — для бэка
        uint64 closeTime,
        uint256 initialLiquidity        // создатель вносит первичную ликвидность
    ) external returns (uint256 id, address market);    // requires isCreator(msg.sender)

    function markets(uint256 id) external view returns (address);
    function marketCount() external view returns (uint256);
}
```
ВАЖНО: `registerCreator(address)` — БЕЗ ENS-параметров (ENS убран). Просто отмечает адрес как creator после World ID-верификации на бэке.

## Контракт 2: Market.sol (бинарный FPMM)

**Состояние:**
```
string question; uint64 closeTime; bool resolved;
uint8 winningOutcome;     // 0=NO, 1=YES, 2=INVALID
uint256 reserveYes; uint256 reserveNo;
uint256 totalLiquidityShares;
uint16 feeBps = 200;      // 2%
uint256 feePool;          // накопленные fee для LP
IERC20 collateral;        // USDC (или EURC для 1 демо-рынка)
mapping(address => mapping(uint8 => uint256)) public balances;  // outcome shares юзера
mapping(address => uint256) public lpShares;
```

**Функции и формулы (фиксированы):**

```
init(uint256 L):
  reserveYes = reserveNo = L;  totalLiquidityShares = L;  lpShares[creator] = L
  (CPMM-инвариант: k = reserveYes * reserveNo)

buy(uint8 outcome, uint256 amountIn):
  require !resolved && block.timestamp < closeTime
  fee = amountIn * feeBps / 10000;  a = amountIn - fee;  feePool += fee
  // outcome=1 (YES): reserveOut=reserveNo? — нет, считаем по покупаемой стороне:
  // покупаем YES-шары: добавляем a в обе виртуальные стороны и забираем YES
  reserveIn  = (outcome==1 ? reserveYes : reserveNo)
  reserveOut = (outcome==1 ? reserveNo  : reserveYes)
  tokensOut = reserveIn + a - (reserveIn * reserveOut) / (reserveOut + a)
  // обновление резервов:
  если outcome==1: reserveYes = reserveYes + a - tokensOut; reserveNo += a
  иначе:           reserveNo  = reserveNo  + a - tokensOut; reserveYes += a
  balances[msg.sender][outcome] += tokensOut
  collateral.transferFrom(msg.sender, this, amountIn)

priceYes() view: reserveNo * 1e18 / (reserveYes + reserveNo)   // 0..1e18

sell(uint8 outcome, uint256 sharesIn):   // ОБРАТНАЯ buy — боевое расширение
  require !resolved && block.timestamp < closeTime
  // вернуть USDC по текущей кривой за сдачу shares, с fee
  // (если по срокам не успеваешь — sell можно отложить, пометить TODO)

resolve(uint8 outcome, string calldata reason):   // onlyResolver
  require block.timestamp >= closeTime && !resolved
  winningOutcome = outcome; resolved = true
  emit Resolved(outcome, reason)   // reason = обоснование CRE/LLM ОНЧЕЙН

redeem():
  require resolved
  если INVALID(2): вернуть 50/50 по обеим сторонам
  иначе: payout = balances[msg.sender][winningOutcome] * 1e6 / 1e18 (за шар)
  обнулить balances, перевести USDC

addLiquidity(uint256 amount) / removeLiquidity():
  LP вносит/забирает пропорционально; removeLiquidity только после resolved (доля пула + fee из feePool)
```

**События:** MarketCreated (в Factory), Buy(user, outcome, amountIn, tokensOut), Sell(...), Resolved(outcome, reason), LiquidityAdded/Removed. Эти события читает индексер бэка — не меняй их сигнатуры без согласования с бэком.

## Контракт 3: Resolver.sol
```solidity
function resolve(uint256 marketId, uint8 outcome, string calldata reason) external; // onlyOracle
function setOracle(address) external; // onlyOwner — адрес бэкенда
```
oracle = бэкенд-адрес. CRE верифицирует логику (симуляция), фактический resolve пишет бэкенд через Resolver (CRE не пишет на Arc — грабля). reason обязателен (обоснование ончейн).

## Advanced Stablecoin Logic (приз Arc $3,500)
- Рынок уже = условный escrow (ликвидность лочится, авто-release по резолюции) — оформи это ЯВНО в коде/комментах как «conditional settlement».
- +1 демо-рынок с **EURC**-коллатералом (мультивалютность — в требованиях Arc). Конструктор Market принимает collateral-адрес (USDC или EURC).

## Тесты (Foundry, обязательно)
- happy path: create → buy YES → buy NO → resolve → redeem
- реверты: buy после closeTime, не-creator создаёт рынок, повторный resolve, registerCreator не-верифаером, redeem до resolve
- инвариант (fuzz): произведение резервов после buy не уменьшается (k не падает)
- сумма всех выплат ≤ USDC на контракте (нет утечки средств)

## Деплой (Deploy.s.sol)
- Factory + Resolver, setVerifier(бэкенд-адрес), setOracle(бэкенд-адрес)
- Сид-рынки: 1 ценовой («ETH > $X к дате» — под CRE), 1 субъективный (под LLM), 1 EURC
- Адреса контрактов → отдать бэку и фронту (в config, НЕ хардкод по коду)

## Граблии (учти)
- USDC 6 decimals, shares считаем в 1e18 — аккуратно с конверсией при redeem (* 1e6 / 1e18)
- approve перед buy (фронт делает approve+buy)
- reentrancy guard на buy/sell/redeem/removeLiquidity

## Порядок работы
1. FPMM Market + Factory + тесты happy path → деплой на Arc
2. resolve + redeem + reason ончейн
3. addLiquidity/removeLiquidity, sell
4. EURC-рынок + явный «conditional settlement» коммент
Fallback: если 1 буксует — оставляешь DemoMarket 50/50, фокус на остальном.
