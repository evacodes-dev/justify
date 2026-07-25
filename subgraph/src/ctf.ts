import { BigInt } from "@graphprotocol/graph-ts";
import {
  ConditionResolution,
  PayoutRedemption,
} from "../generated/ConditionalTokens/ConditionalTokens";
import { ConditionRef, Market, Position, Trader } from "../generated/schema";
import { ZERO_BD, ZERO_BI, getGlobal, outcomeName, toDecimal } from "./helpers";

// The audited Gnosis escrow is the authoritative source of truth for settlement: whatever the
// resolver routed, the payout report here is what pays out. It speaks conditionId, so markets
// are found through the ConditionRef reverse index written at creation.

export function handleConditionResolution(event: ConditionResolution): void {
  let ref = ConditionRef.load(event.params.conditionId.toHexString());
  if (ref == null) return;
  let market = Market.load(ref.market);
  if (market == null) return;

  let payouts = event.params.payoutNumerators;
  if (payouts.length < 2) return;

  // Slot 0 = NO, slot 1 = YES. Both sides paying out is the INVALID (split) settlement.
  let outcomeIndex = 2;
  if (payouts[0].gt(ZERO_BI) && payouts[1].gt(ZERO_BI)) {
    outcomeIndex = 2;
  } else if (payouts[1].gt(ZERO_BI)) {
    outcomeIndex = 1;
  } else {
    outcomeIndex = 0;
  }

  let alreadyResolved = market.status == "RESOLVED";
  market.outcome = outcomeName(outcomeIndex);
  market.status = "RESOLVED";
  if (market.resolvedAt === null) {
    market.resolvedAt = event.block.timestamp;
    market.resolutionTx = event.transaction.hash;
  }
  market.save();

  if (!alreadyResolved) {
    let global = getGlobal();
    global.resolvedMarketCount = global.resolvedMarketCount + 1;
    global.save();
  }
}

/// Redemption closes the loop on PnL: whatever the winning shares paid out, minus the cost
/// basis still carried on the position, is the trader's final realized result.
export function handlePayoutRedemption(event: PayoutRedemption): void {
  let ref = ConditionRef.load(event.params.conditionId.toHexString());
  if (ref == null) return;
  let market = Market.load(ref.market);
  if (market == null) return;

  let traderId = event.params.redeemer.toHexString();
  let position = Position.load(market.id + "-" + traderId);
  if (position == null) return;

  let payout = toDecimal(event.params.payout);
  let remainingCost = position.yesCostUSDC.plus(position.noCostUSDC);
  let realizedDelta = payout.minus(remainingCost);

  position.redeemedUSDC = position.redeemedUSDC.plus(payout);
  position.realizedPnlUSDC = position.realizedPnlUSDC.plus(realizedDelta);
  position.yesShares = ZERO_BD;
  position.noShares = ZERO_BD;
  position.yesCostUSDC = ZERO_BD;
  position.noCostUSDC = ZERO_BD;
  position.save();

  let trader = Trader.load(traderId);
  if (trader == null) return;
  trader.redeemedUSDC = trader.redeemedUSDC.plus(payout);
  trader.realizedPnlUSDC = trader.realizedPnlUSDC.plus(realizedDelta);
  trader.lastSeenAt = event.block.timestamp;
  trader.save();
}