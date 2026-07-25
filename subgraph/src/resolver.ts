import { PriceResolved, Resolved } from "../generated/CtfResolver/CtfResolver";
import { Market } from "../generated/schema";
import { outcomeName } from "./helpers";

// The resolver is the condition oracle: it routes a verdict (optimistic AI settlement, a
// committed Chainlink price rule, or a direct admin call) into the audited CTF payout report.
// `reason` is the public evidence string — it carries the 0g:// pointer to the TEE-verified
// justification bundle once resolutions move to 0G Storage.

export function handleResolved(event: Resolved): void {
  let market = Market.load(event.params.marketId.toString());
  if (market == null) return;

  market.outcome = outcomeName(event.params.outcome);
  market.resolutionReason = event.params.reason;
  market.resolvedAt = event.block.timestamp;
  market.resolutionTx = event.transaction.hash;
  market.status = "RESOLVED";
  if (market.resolutionKind === null) {
    market.resolutionKind = kindFromReason(event.params.reason);
  }
  market.save();
}

export function handlePriceResolved(event: PriceResolved): void {
  let market = Market.load(event.params.marketId.toString());
  if (market == null) return;
  market.resolutionKind = "PRICE_FEED";
  market.save();
}

/// Deterministic price markets bypass the settler entirely; everything else arrives with the
/// settler's prefix on the proposer's evidence.
function kindFromReason(reason: string): string {
  if (reason.startsWith("Optimistic settlement (unchallenged)")) return "OPTIMISTIC_AI";
  if (reason.startsWith("Optimistic settlement")) return "OPTIMISTIC_CHALLENGE";
  return "DIRECT";
}