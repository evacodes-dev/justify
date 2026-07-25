import {
  ChallengeDisputed,
  Challenged,
  Finalized,
  Proposed,
  ResolveFailed,
} from "../generated/OptimisticSettler/OptimisticSettler";
import { Market, Resolution } from "../generated/schema";
import { getGlobal, outcomeName, toDecimal } from "./helpers";

// The optimistic settlement lifecycle: an allowlisted truth source (the AI resolution agent,
// or the CRE receiver) proposes an outcome, anyone may challenge it inside the public window,
// and a challenge escalates to UMA. Indexing it as one Resolution entity gives the app — and
// the agent reasoning over its own track record — the whole story per market in one query.

export function handleProposed(event: Proposed): void {
  let marketId = event.params.marketId.toString();
  let market = Market.load(marketId);
  if (market == null) return;

  let resolution = new Resolution(marketId);
  resolution.market = marketId;
  resolution.proposedOutcome = outcomeName(event.params.outcome);
  resolution.proposer = event.params.proposer;
  resolution.reason = event.params.reason;
  resolution.proposedAt = event.block.timestamp;
  resolution.proposedTx = event.transaction.hash;
  resolution.challenged = false;
  resolution.disputed = false;
  resolution.finalized = false;
  resolution.resolveFailed = false;
  resolution.save();

  market.status = "PROPOSED";
  market.resolution = resolution.id;
  market.resolutionReason = event.params.reason;
  market.save();

  let global = getGlobal();
  global.aiProposalCount = global.aiProposalCount + 1;
  global.save();
}

export function handleChallenged(event: Challenged): void {
  let marketId = event.params.marketId.toString();
  let resolution = Resolution.load(marketId);
  if (resolution == null) return;

  resolution.challenged = true;
  resolution.challenger = event.params.challenger;
  resolution.counterOutcome = outcomeName(event.params.counterOutcome);
  resolution.assertionId = event.params.assertionId;
  resolution.bond = toDecimal(event.params.bond);
  resolution.challengedAt = event.block.timestamp;
  resolution.save();

  let market = Market.load(marketId);
  if (market != null) {
    market.status = "CHALLENGED";
    market.save();
  }

  let global = getGlobal();
  global.challengeCount = global.challengeCount + 1;
  global.save();
}

export function handleChallengeDisputed(event: ChallengeDisputed): void {
  let resolution = Resolution.load(event.params.marketId.toString());
  if (resolution == null) return;
  resolution.disputed = true;
  resolution.save();
}

export function handleFinalized(event: Finalized): void {
  let resolution = Resolution.load(event.params.marketId.toString());
  if (resolution == null) return;

  resolution.finalized = true;
  resolution.finalOutcome = outcomeName(event.params.outcome);
  resolution.viaChallenge = event.params.viaChallenge;
  resolution.finalizedAt = event.block.timestamp;
  resolution.finalizedTx = event.transaction.hash;
  resolution.save();
}

/// The settler never reverts back into UMA's settlement pipeline — a failed hand-off to the
/// resolver is logged instead, and surfaces here so the market does not look silently stuck.
export function handleResolveFailed(event: ResolveFailed): void {
  let resolution = Resolution.load(event.params.marketId.toString());
  if (resolution == null) return;
  resolution.resolveFailed = true;
  resolution.save();
}