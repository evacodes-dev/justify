import { Address, BigDecimal, BigInt, dataSource, ethereum } from "@graphprotocol/graph-ts";
import {
  FPMMBuy,
  FPMMFundingAdded,
  FPMMFundingRemoved,
  FPMMSell,
} from "../generated/templates/FixedProductMarketMaker/FixedProductMarketMaker";
import { Creator, Market, PricePoint, Trade } from "../generated/schema";
import {
  ZERO_BD,
  ZERO_BI,
  clampBD,
  clampBI,
  getGlobal,
  getOrCreatePosition,
  getOrCreateTrader,
  outcomeName,
  priceFromPools,
  toDecimal,
} from "./helpers";

// The audited Gnosis FixedProductMarketMaker emits trades but never a price, and it holds the
// pooled outcome tokens as ERC-1155 balances on the ConditionalTokens contract. Rather than an
// RPC read per trade, the pools are tracked incrementally from the exact deltas each event
// implies:
//
//   buy(amount, i):  every pool += amount − fee   (split through all conditions)
//                    pool[i]    −= outcomeTokensBought
//   sell(return, i): pool[i]    += outcomeTokensSold
//                    every pool −= return + fee   (merge through all conditions)
//
// Pools are seeded from chain state when the market is created, so initial liquidity is
// already accounted for by the time this data source starts.

function loadMarket(): Market | null {
  let id = dataSource.context().getString("marketId");
  return Market.load(id);
}

export function handleBuy(event: FPMMBuy): void {
  let maybe = loadMarket();
  if (maybe == null) return;
  let market = maybe as Market;

  let outcomeIndex = event.params.outcomeIndex.toI32();
  let netIn = event.params.investmentAmount.minus(event.params.feeAmount);

  let poolNo = market.poolNo.plus(netIn);
  let poolYes = market.poolYes.plus(netIn);
  if (outcomeIndex == 1) {
    poolYes = clampBI(poolYes.minus(event.params.outcomeTokensBought));
  } else {
    poolNo = clampBI(poolNo.minus(event.params.outcomeTokensBought));
  }

  let amountUSDC = toDecimal(event.params.investmentAmount);
  let shares = toDecimal(event.params.outcomeTokensBought);

  recordTrade(
    event,
    market,
    event.params.buyer,
    poolNo,
    poolYes,
    true,
    outcomeIndex,
    amountUSDC,
    toDecimal(event.params.feeAmount),
    shares
  );
}

export function handleSell(event: FPMMSell): void {
  let maybe = loadMarket();
  if (maybe == null) return;
  let market = maybe as Market;

  let outcomeIndex = event.params.outcomeIndex.toI32();
  let grossOut = event.params.returnAmount.plus(event.params.feeAmount);

  let poolNo = market.poolNo;
  let poolYes = market.poolYes;
  if (outcomeIndex == 1) {
    poolYes = poolYes.plus(event.params.outcomeTokensSold);
  } else {
    poolNo = poolNo.plus(event.params.outcomeTokensSold);
  }
  poolNo = clampBI(poolNo.minus(grossOut));
  poolYes = clampBI(poolYes.minus(grossOut));

  let amountUSDC = toDecimal(event.params.returnAmount);
  let shares = toDecimal(event.params.outcomeTokensSold);

  recordTrade(
    event,
    market,
    event.params.seller,
    poolNo,
    poolYes,
    false,
    outcomeIndex,
    amountUSDC,
    toDecimal(event.params.feeAmount),
    shares
  );
}

/// Liquidity provision moves both pools without being a trade — it must not touch volume,
/// positions or PnL, but it does move the price.
export function handleFundingAdded(event: FPMMFundingAdded): void {
  let maybe = loadMarket();
  if (maybe == null) return;
  let market = maybe as Market;

  // The market's initial funding happens inside the creation transaction and is already
  // captured by the pool balances seeded there.
  if (event.block.number.equals(market.createdAtBlock)) return;

  let amounts = event.params.amountsAdded;
  if (amounts.length < 2) return;
  applyFunding(event, market, market.poolNo.plus(amounts[0]), market.poolYes.plus(amounts[1]));
}

export function handleFundingRemoved(event: FPMMFundingRemoved): void {
  let maybe = loadMarket();
  if (maybe == null) return;
  let market = maybe as Market;

  let amounts = event.params.amountsRemoved;
  if (amounts.length < 2) return;
  applyFunding(
    event,
    market,
    clampBI(market.poolNo.minus(amounts[0])),
    clampBI(market.poolYes.minus(amounts[1]))
  );
}

function applyFunding(
  event: ethereum.Event,
  market: Market,
  poolNo: BigInt,
  poolYes: BigInt
): void {
  let previousLiquidity = market.liquidityUSDC;
  market.poolNo = poolNo;
  market.poolYes = poolYes;
  market.yesPrice = priceFromPools(poolNo, poolYes);
  market.liquidityUSDC = toDecimal(poolNo.lt(poolYes) ? poolNo : poolYes);
  market.save();

  let global = getGlobal();
  global.liquidityUSDC = clampBD(
    global.liquidityUSDC.minus(previousLiquidity).plus(market.liquidityUSDC)
  );
  global.save();

  savePricePoint(event, market);
}

function recordTrade(
  event: ethereum.Event,
  market: Market,
  traderAddress: Address,
  poolNo: BigInt,
  poolYes: BigInt,
  isBuy: boolean,
  outcomeIndex: i32,
  amountUSDC: BigDecimal,
  feeUSDC: BigDecimal,
  shares: BigDecimal
): void {
  let trader = getOrCreateTrader(traderAddress, event.block.timestamp);
  let positionResult = getOrCreatePosition(market, trader, event.block.timestamp);
  let position = positionResult.position;

  let previousLiquidity = market.liquidityUSDC;
  let realizedDelta = ZERO_BD;

  if (isBuy) {
    if (outcomeIndex == 1) {
      position.yesShares = position.yesShares.plus(shares);
      position.yesCostUSDC = position.yesCostUSDC.plus(amountUSDC);
    } else {
      position.noShares = position.noShares.plus(shares);
      position.noCostUSDC = position.noCostUSDC.plus(amountUSDC);
    }
  } else {
    // Average-cost accounting: the sold shares release their share of the cost basis, and the
    // difference against the proceeds is realized PnL.
    let heldShares = outcomeIndex == 1 ? position.yesShares : position.noShares;
    let heldCost = outcomeIndex == 1 ? position.yesCostUSDC : position.noCostUSDC;

    let costRemoved = ZERO_BD;
    if (heldShares.gt(ZERO_BD)) {
      let sold = shares.gt(heldShares) ? heldShares : shares;
      costRemoved = heldCost.times(sold).div(heldShares);
    }
    realizedDelta = amountUSDC.minus(costRemoved);

    if (outcomeIndex == 1) {
      position.yesShares = clampBD(position.yesShares.minus(shares));
      position.yesCostUSDC = clampBD(position.yesCostUSDC.minus(costRemoved));
    } else {
      position.noShares = clampBD(position.noShares.minus(shares));
      position.noCostUSDC = clampBD(position.noCostUSDC.minus(costRemoved));
    }
    position.realizedPnlUSDC = position.realizedPnlUSDC.plus(realizedDelta);
  }

  position.tradeCount = position.tradeCount + 1;
  position.lastTradeAt = event.block.timestamp;
  position.save();

  market.poolNo = poolNo;
  market.poolYes = poolYes;
  market.yesPrice = priceFromPools(poolNo, poolYes);
  market.liquidityUSDC = toDecimal(poolNo.lt(poolYes) ? poolNo : poolYes);
  market.volumeUSDC = market.volumeUSDC.plus(amountUSDC);
  market.tradeCount = market.tradeCount + 1;
  if (positionResult.created) {
    market.traderCount = market.traderCount + 1;
  }
  market.save();

  trader.volumeUSDC = trader.volumeUSDC.plus(amountUSDC);
  trader.realizedPnlUSDC = trader.realizedPnlUSDC.plus(realizedDelta);
  trader.tradeCount = trader.tradeCount + 1;
  trader.lastSeenAt = event.block.timestamp;
  if (positionResult.created) {
    trader.marketsTraded = trader.marketsTraded + 1;
  }
  trader.save();

  let trade = new Trade(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  );
  trade.market = market.id;
  trade.trader = trader.id;
  trade.isBuy = isBuy;
  trade.outcome = outcomeName(outcomeIndex);
  trade.amountUSDC = amountUSDC;
  trade.feeUSDC = feeUSDC;
  trade.shares = shares;
  trade.price = shares.gt(ZERO_BD) ? amountUSDC.div(shares) : ZERO_BD;
  trade.yesPriceAfter = market.yesPrice;
  trade.timestamp = event.block.timestamp;
  trade.blockNumber = event.block.number;
  trade.txHash = event.transaction.hash;
  trade.save();

  let creator = market.creator;
  let global = getGlobal();
  global.tradeCount = global.tradeCount + 1;
  global.volumeUSDC = global.volumeUSDC.plus(amountUSDC);
  global.liquidityUSDC = clampBD(
    global.liquidityUSDC.minus(previousLiquidity).plus(market.liquidityUSDC)
  );
  global.save();

  bumpCreatorVolume(creator, amountUSDC);
  savePricePoint(event, market);
}

function bumpCreatorVolume(creatorId: string, amountUSDC: BigDecimal): void {
  let creator = Creator.load(creatorId);
  if (creator == null) return;
  creator.volumeUSDC = creator.volumeUSDC.plus(amountUSDC);
  creator.save();
}

function savePricePoint(event: ethereum.Event, market: Market): void {
  let point = new PricePoint(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  );
  point.market = market.id;
  point.yesPrice = market.yesPrice;
  point.poolNo = market.poolNo;
  point.poolYes = market.poolYes;
  point.timestamp = event.block.timestamp;
  point.blockNumber = event.block.number;
  point.save();
}