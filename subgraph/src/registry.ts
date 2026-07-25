import { Address, BigInt, Bytes, DataSourceContext, log } from "@graphprotocol/graph-ts";
import {
  CreatorRegistered,
  MarketCreated,
  MarketRegistry,
} from "../generated/MarketRegistry/MarketRegistry";
import { ConditionalTokens } from "../generated/MarketRegistry/ConditionalTokens";
import { ConditionRef, Market } from "../generated/schema";
import { FixedProductMarketMaker } from "../generated/templates";
import {
  ZERO_BD,
  ZERO_BI,
  ZERO_BYTES32,
  getGlobal,
  getOrCreateCreator,
  priceFromPools,
  toDecimal,
} from "./helpers";

export function handleCreatorRegistered(event: CreatorRegistered): void {
  let creator = getOrCreateCreator(event.params.user);
  if (creator.registeredAt === null) {
    creator.registeredAt = event.block.timestamp;
  }
  creator.save();
}

export function handleMarketCreated(event: MarketCreated): void {
  let id = event.params.id.toString();
  if (Market.load(id) != null) return;

  let registry = MarketRegistry.bind(event.address);
  let info = registry.try_markets(event.params.id);
  if (info.reverted) {
    log.warning("markets({}) reverted — skipping market", [id]);
    return;
  }
  // (fpmm, conditionId, questionId, creator, collateral, closeTime, question, metadataURI)
  let questionId = info.value.value2;
  let collateral = info.value.value4;
  let metadataURI = info.value.value7;

  let ctfCall = registry.try_ctf();
  if (ctfCall.reverted) {
    log.warning("ctf() reverted — skipping market {}", [id]);
    return;
  }
  let ctf = ConditionalTokens.bind(ctfCall.value);
  let conditionId = event.params.conditionId;

  // Index set 1 = slot 0 = NO, index set 2 = slot 1 = YES (binary condition).
  let posNo = positionId(ctf, collateral, conditionId, 1);
  let posYes = positionId(ctf, collateral, conditionId, 2);
  if (posNo === null || posYes === null) {
    log.warning("position ids unavailable — skipping market {}", [id]);
    return;
  }

  // Seed the pools from chain state: the initial liquidity is funded inside this same
  // transaction, before the template below starts listening.
  let poolNo = balanceOf(ctf, event.params.fpmm, posNo as BigInt);
  let poolYes = balanceOf(ctf, event.params.fpmm, posYes as BigInt);

  let creator = getOrCreateCreator(event.params.creator);
  creator.marketCount = creator.marketCount + 1;
  creator.save();

  let market = new Market(id);
  market.marketId = event.params.id;
  market.fpmm = event.params.fpmm;
  market.conditionId = conditionId;
  market.questionId = questionId;
  market.ctf = ctfCall.value;
  market.collateral = collateral;
  market.creator = creator.id;
  market.question = event.params.question;
  market.metadataURI = metadataURI;
  market.closeTime = event.params.closeTime;
  market.createdAt = event.block.timestamp;
  market.createdAtBlock = event.block.number;
  market.createdTx = event.transaction.hash;
  market.posNo = posNo as BigInt;
  market.posYes = posYes as BigInt;
  market.poolNo = poolNo;
  market.poolYes = poolYes;
  market.status = "OPEN";
  market.yesPrice = priceFromPools(poolNo, poolYes);
  market.volumeUSDC = ZERO_BD;
  market.liquidityUSDC = toDecimal(poolNo.lt(poolYes) ? poolNo : poolYes);
  market.tradeCount = 0;
  market.traderCount = 0;
  market.save();

  let ref = new ConditionRef(conditionId.toHexString());
  ref.market = market.id;
  ref.save();

  let global = getGlobal();
  global.marketCount = global.marketCount + 1;
  global.liquidityUSDC = global.liquidityUSDC.plus(market.liquidityUSDC);
  global.save();

  // Trades live on the market's own FixedProductMarketMaker — spawn a data source for it and
  // carry the market id across so the trade handlers need no reverse lookup.
  let context = new DataSourceContext();
  context.setString("marketId", id);
  FixedProductMarketMaker.createWithContext(event.params.fpmm, context);
}

function positionId(
  ctf: ConditionalTokens,
  collateral: Bytes,
  conditionId: Bytes,
  indexSet: i32
): BigInt | null {
  let collection = ctf.try_getCollectionId(
    ZERO_BYTES32,
    conditionId,
    BigInt.fromI32(indexSet)
  );
  if (collection.reverted) return null;
  let position = ctf.try_getPositionId(
    changetype<Address>(collateral),
    collection.value
  );
  if (position.reverted) return null;
  return position.value;
}

function balanceOf(ctf: ConditionalTokens, owner: Bytes, position: BigInt): BigInt {
  let call = ctf.try_balanceOf(changetype<Address>(owner), position);
  return call.reverted ? ZERO_BI : call.value;
}
