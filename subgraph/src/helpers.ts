import { Address, BigDecimal, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { Creator, Global, Market, Position, Trader } from "../generated/schema";

export const ZERO_BI = BigInt.zero();
export const ONE_BI = BigInt.fromI32(1);
export const ZERO_BD = BigDecimal.zero();
export const HALF_BD = BigDecimal.fromString("0.5");
export const GLOBAL_ID = "global";

// Collateral is USDC (6dp). Outcome tokens are denominated in collateral units, so shares
// share the same scale.
const USDC_SCALE = BigDecimal.fromString("1000000");

export const ZERO_BYTES32 = Bytes.fromHexString(
  "0x0000000000000000000000000000000000000000000000000000000000000000"
);

export function toDecimal(value: BigInt): BigDecimal {
  return value.toBigDecimal().div(USDC_SCALE);
}

/// Outcome slots on the binary condition: index 0 = NO, index 1 = YES, 2 = INVALID (split payout).
export function outcomeName(index: i32): string {
  if (index == 1) return "YES";
  if (index == 0) return "NO";
  return "INVALID";
}

export function getGlobal(): Global {
  let g = Global.load(GLOBAL_ID);
  if (g == null) {
    g = new Global(GLOBAL_ID);
    g.marketCount = 0;
    g.resolvedMarketCount = 0;
    g.tradeCount = 0;
    g.traderCount = 0;
    g.creatorCount = 0;
    g.volumeUSDC = ZERO_BD;
    g.liquidityUSDC = ZERO_BD;
    g.aiProposalCount = 0;
    g.challengeCount = 0;
  }
  return g as Global;
}

export function getOrCreateTrader(address: Address, timestamp: BigInt): Trader {
  let id = address.toHexString();
  let t = Trader.load(id);
  if (t == null) {
    t = new Trader(id);
    t.address = address;
    t.volumeUSDC = ZERO_BD;
    t.realizedPnlUSDC = ZERO_BD;
    t.redeemedUSDC = ZERO_BD;
    t.tradeCount = 0;
    t.marketsTraded = 0;
    t.firstSeenAt = timestamp;
    t.lastSeenAt = timestamp;

    let g = getGlobal();
    g.traderCount = g.traderCount + 1;
    g.save();
  }
  return t as Trader;
}

export function getOrCreateCreator(address: Address): Creator {
  let id = address.toHexString();
  let c = Creator.load(id);
  if (c == null) {
    c = new Creator(id);
    c.address = address;
    c.marketCount = 0;
    c.volumeUSDC = ZERO_BD;

    let g = getGlobal();
    g.creatorCount = g.creatorCount + 1;
    g.save();
  }
  return c as Creator;
}

/// Returns the position and whether it was created by this call (used to count unique
/// traders per market and markets per trader).
export class PositionResult {
  position: Position;
  created: boolean;

  constructor(position: Position, created: boolean) {
    this.position = position;
    this.created = created;
  }
}

export function getOrCreatePosition(
  market: Market,
  trader: Trader,
  timestamp: BigInt
): PositionResult {
  let id = market.id + "-" + trader.id;
  let p = Position.load(id);
  if (p != null) {
    return new PositionResult(p as Position, false);
  }
  p = new Position(id);
  p.market = market.id;
  p.trader = trader.id;
  p.yesShares = ZERO_BD;
  p.noShares = ZERO_BD;
  p.yesCostUSDC = ZERO_BD;
  p.noCostUSDC = ZERO_BD;
  p.realizedPnlUSDC = ZERO_BD;
  p.redeemedUSDC = ZERO_BD;
  p.tradeCount = 0;
  p.firstTradeAt = timestamp;
  p.lastTradeAt = timestamp;
  return new PositionResult(p as Position, true);
}

/// priceYes = poolNo / (poolNo + poolYes). The audited FPMM emits no price, so it is derived
/// from the pooled outcome-token balances: the scarcer side of the pool is the pricier one.
export function priceFromPools(poolNo: BigInt, poolYes: BigInt): BigDecimal {
  let total = poolNo.plus(poolYes);
  if (total.le(ZERO_BI)) return HALF_BD;
  return poolNo.toBigDecimal().div(total.toBigDecimal());
}

/// Pool balances can never go negative; guard against underflow from any event we did not see
/// (e.g. a trade in the market's creation block, already captured by the seeded balances).
export function clampBI(value: BigInt): BigInt {
  return value.lt(ZERO_BI) ? ZERO_BI : value;
}

export function clampBD(value: BigDecimal): BigDecimal {
  return value.lt(ZERO_BD) ? ZERO_BD : value;
}
