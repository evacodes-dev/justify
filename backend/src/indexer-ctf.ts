import { getAddress } from "viem";
import { publicClient } from "./chain.js";
import { config, fromUsdc } from "./config.js";
import { registryAbi, ctfAbi, fpmmAbi } from "./abis.js";
import { db, kv, type Market } from "./store.js";

// Path-B indexer: audited Gnosis stack. Markets come from OUR MarketRegistry; trades are
// FPMMBuy/FPMMSell on each market's FixedProductMarketMaker; resolution is the CTF
// ConditionResolution event (payout report). Prices are recomputed from the FPMM's pooled
// outcome-token balances after every trade (the audited contracts don't emit a price).
// Same external contract as the legacy indexer: fills db.markets/trades/positions/feed.

const CURSOR = "ctf:lastBlock";
const registry = () => config.registry!;
const ctf = () => config.ctf!;

async function poolPrice(m: Market): Promise<number> {
  // priceYes = poolNo / (poolYes + poolNo) — scarcer YES in the pool → pricier YES
  const [balNo, balYes] = await Promise.all([
    publicClient.readContract({ address: ctf(), abi: ctfAbi, functionName: "balanceOf", args: [m.address as `0x${string}`, BigInt(m.posNo!)] }) as Promise<bigint>,
    publicClient.readContract({ address: ctf(), abi: ctfAbi, functionName: "balanceOf", args: [m.address as `0x${string}`, BigInt(m.posYes!)] }) as Promise<bigint>,
  ]);
  const t = balNo + balYes;
  return t === 0n ? 0.5 : Number(balNo) / Number(t);
}

async function positionIds(collateral: `0x${string}`, conditionId: `0x${string}`): Promise<[bigint, bigint]> {
  const ids: bigint[] = [];
  for (const ix of [1n, 2n]) {
    const coll = (await publicClient.readContract({
      address: ctf(), abi: ctfAbi, functionName: "getCollectionId",
      args: ["0x0000000000000000000000000000000000000000000000000000000000000000", conditionId, ix],
    })) as `0x${string}`;
    ids.push((await publicClient.readContract({
      address: ctf(), abi: ctfAbi, functionName: "getPositionId", args: [collateral, coll],
    })) as bigint);
  }
  return [ids[0], ids[1]];
}

function addPosition(marketId: number, user: string, outcome: number, shares: number) {
  const id = `${marketId}:${user.toLowerCase()}`;
  const cur = db.positions.get(id) ?? { id, marketId, user, yes: 0, no: 0 };
  if (outcome === 1) cur.yes = Math.max(0, cur.yes + shares);
  else cur.no = Math.max(0, cur.no + shares);
  db.positions.put(cur);
}

async function scan() {
  const latest = await publicClient.getBlockNumber();
  const from = BigInt(kv.get(CURSOR, Number(config.deployBlock))) + 1n;
  if (from > latest) return;
  const to = latest > from + 4999n ? from + 4999n : latest; // chunked

  // 1) new markets from OUR registry
  const created = await publicClient.getLogs({
    address: registry(),
    event: registryAbi.find((x: any) => x.name === "MarketCreated") as any,
    fromBlock: from, toBlock: to,
  });
  for (const log of created) {
    const a = (log as any).args;
    const id = Number(a.id);
    if (db.markets.get(id)) continue;
    const info = (await publicClient.readContract({
      address: registry(), abi: registryAbi, functionName: "markets", args: [BigInt(id)],
    })) as readonly [string, string, string, string, string, bigint, string, string];
    const [pNo, pYes] = await positionIds(info[4] as `0x${string}`, info[1] as `0x${string}`);
    db.markets.put({
      id, address: getAddress(a.fpmm), question: a.question, metadataURI: info[7],
      collateral: info[4], creator: getAddress(a.creator), closeTime: Number(a.closeTime),
      createdAt: Date.now(), priceYes: 0.5, volume: 0, resolved: false, backfilled: true,
      conditionId: info[1], posNo: pNo.toString(), posYes: pYes.toString(),
    });
  }

  // 2) trades on known FPMMs
  const markets = db.markets.all();
  const fpmms = markets.map((m) => m.address as `0x${string}`);
  if (fpmms.length) {
    const logs = await publicClient.getLogs({
      address: fpmms,
      events: [fpmmAbi.find((x: any) => x.name === "FPMMBuy"), fpmmAbi.find((x: any) => x.name === "FPMMSell")] as any,
      fromBlock: from, toBlock: to,
    });
    for (const log of logs) {
      const m = markets.find((x) => x.address.toLowerCase() === (log.address as string).toLowerCase());
      if (!m) continue;
      const a = (log as any).args;
      const isBuy = (log as any).eventName === "FPMMBuy";
      const user = getAddress(isBuy ? a.buyer : a.seller);
      const outcome = Number(a.outcomeIndex); // slots: 0 = NO, 1 = YES
      const amountUsdc = fromUsdc(isBuy ? a.investmentAmount : a.returnAmount);
      const shares = fromUsdc(isBuy ? a.outcomeTokensBought : a.outcomeTokensSold);
      const isAgent = !!db.agents.find((ag) => ag.address.toLowerCase() === user.toLowerCase());
      const priceYes = await poolPrice(m).catch(() => m.priceYes);
      db.trades.put({
        id: (log as any).transactionHash + ":" + (log as any).logIndex,
        marketId: m.id, user, outcome, amountUsdc: isBuy ? amountUsdc : -amountUsdc,
        shares: isBuy ? shares : -shares, priceYesAfter: priceYes,
        tx: (log as any).transactionHash, ts: Date.now(), agent: isAgent,
      });
      addPosition(m.id, user, outcome, isBuy ? shares : -shares);
      db.markets.patch(m.id, { volume: m.volume + amountUsdc, priceYes });
      if (!isAgent) {
        const u = db.users.find((x) => x.address.toLowerCase() === user.toLowerCase());
        db.feed.prepend({
          id: (log as any).transactionHash + ":" + (log as any).logIndex, ts: Date.now(), kind: "trade",
          user: u?.name ?? user, marketId: m.id, marketQuestion: m.question, outcome,
          amountUsdc, tx: (log as any).transactionHash,
        });
      }
    }
  }

  // 3) resolutions from the audited escrow (payout reports)
  const resolutions = await publicClient.getLogs({
    address: ctf(),
    event: ctfAbi.find((x: any) => x.name === "ConditionResolution") as any,
    fromBlock: from, toBlock: to,
  });
  for (const log of resolutions) {
    const a = (log as any).args;
    const m = markets.find((x) => (x.conditionId ?? "").toLowerCase() === String(a.conditionId).toLowerCase());
    if (!m || m.resolved) continue;
    const nums = a.payoutNumerators as readonly bigint[];
    const outcome = nums[0] > 0n && nums[1] > 0n ? 2 : nums[1] > 0n ? 1 : 0;
    db.markets.patch(m.id, { resolved: true, outcome });
    db.feed.prepend({
      id: "res:" + m.id + ":" + (log as any).transactionHash, ts: Date.now(), kind: "resolution",
      marketId: m.id, marketQuestion: m.question, outcome, tx: (log as any).transactionHash,
    });
  }

  kv.set(CURSOR, Number(to));
}

export function startCtfIndexer() {
  const loop = () => scan().catch((e) => console.error("[indexer-ctf]", (e as Error).message));
  loop();
  return setInterval(loop, 5000);
}
