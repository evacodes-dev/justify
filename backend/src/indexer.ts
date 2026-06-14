import { getAddress } from "viem";
import { publicClient } from "./chain.js";
import { config, fromUsdc } from "./config.js";
import { factoryAbi, marketAbi } from "./abis.js";
import { db, kv, type Market } from "./store.js";

// Simple event poller over Arc (no subgraph). Every 5s: pick up new markets from the
// factory and new Buy/Resolved events from known markets → update file stores.

const CHUNK = 5_000n;

// Block timestamps are immutable, so cache them across ticks. Used to give trades a
// real on-chain time (the price chart's x-axis) instead of the indexer's poll time.
const blockTsCache = new Map<string, number>();
async function blockTimeMs(blockNumber: bigint): Promise<number> {
  const key = blockNumber.toString();
  const hit = blockTsCache.get(key);
  if (hit !== undefined) return hit;
  const block = await publicClient.getBlock({ blockNumber });
  const ms = Number(block.timestamp) * 1000;
  blockTsCache.set(key, ms);
  return ms;
}

async function readMarketStatic(address: `0x${string}`) {
  const [question, metadataURI, collateral, creator, closeTime] = await Promise.all([
    publicClient.readContract({ address, abi: marketAbi, functionName: "question" }),
    publicClient.readContract({ address, abi: marketAbi, functionName: "metadataURI" }),
    publicClient.readContract({ address, abi: marketAbi, functionName: "collateral" }),
    publicClient.readContract({ address, abi: marketAbi, functionName: "creator" }),
    publicClient.readContract({ address, abi: marketAbi, functionName: "closeTime" }),
  ]);
  return { question, metadataURI, collateral, creator, closeTime: Number(closeTime) };
}

async function refreshMarketDynamic(id: number, address: `0x${string}`) {
  const [price, resolved] = await Promise.all([
    publicClient.readContract({ address, abi: marketAbi, functionName: "priceYes" }),
    publicClient.readContract({ address, abi: marketAbi, functionName: "resolved" }),
  ]);
  const patch: Partial<Market> = { priceYes: Number(price) / 1e18, resolved };
  if (resolved) {
    const [outcome, reason] = await Promise.all([
      publicClient.readContract({ address, abi: marketAbi, functionName: "winningOutcome" }),
      publicClient.readContract({ address, abi: marketAbi, functionName: "resolutionReason" }),
    ]);
    patch.outcome = Number(outcome);
    patch.reason = reason as string;
  }
  db.markets.patch(id, patch);
}

function addPosition(marketId: number, user: string, outcome: number, shares: number) {
  const pid = `${marketId}:${user.toLowerCase()}`;
  const p = db.positions.get(pid) ?? { id: pid, marketId, user: user.toLowerCase(), yes: 0, no: 0 };
  if (outcome === 1) p.yes += shares;
  else p.no += shares;
  db.positions.put(p);
}

// One-time historical trade backfill for a market. The incremental loop only sees
// Buy events for markets already in the DB when each block-chunk is scanned, so
// trades that predate a market's discovery (seed markets created before deployBlock,
// or any discovery race) are never indexed. Scan this market's full Buy history once
// and upsert the trade rows — idempotent (keyed by tx:logIndex), so safe to re-run.
// Only db.trades + volume are touched here; positions/feed stay with the live loop.
const buyEvent = marketAbi.find((x: any) => x.name === "Buy");
async function backfillMarketTrades(m: Market, latest: bigint) {
  for (let f = config.deployBlock + 1n; f <= latest; f += CHUNK) {
    const t = f + CHUNK > latest ? latest : f + CHUNK;
    const logs = await publicClient.getLogs({ address: m.address as `0x${string}`, event: buyEvent as any, fromBlock: f, toBlock: t });
    for (const log of logs) {
      const a = (log as any).args;
      const user = getAddress(a.user);
      const blockTs = await blockTimeMs((log as any).blockNumber).catch(() => Date.now());
      db.trades.put({
        id: (log as any).transactionHash + ":" + (log as any).logIndex,
        marketId: m.id, user, outcome: Number(a.outcome), amountUsdc: fromUsdc(a.amountIn), shares: fromUsdc(a.tokensOut),
        priceYesAfter: Number(a.priceYesAfter) / 1e18, tx: (log as any).transactionHash, ts: Date.now(), blockTs,
        agent: !!db.agents.find((ag) => ag.address.toLowerCase() === user.toLowerCase()),
      });
    }
  }
  // Recompute volume from the authoritative trade set (avoids double counting if the
  // incremental loop already saw some of these trades this run).
  const volume = db.trades.filter((x) => x.marketId === m.id).reduce((s, x) => s + x.amountUsdc, 0);
  db.markets.patch(m.id, { volume, backfilled: true });
}

function recomputeReputation(marketId: number, winningOutcome: number) {
  const positions = db.positions.filter((p) => p.marketId === marketId);
  for (const p of positions) {
    const won = winningOutcome === 2 ? true : (winningOutcome === 1 ? p.yes >= p.no : p.no >= p.yes);
    const agent = db.agents.find((a) => a.address.toLowerCase() === p.user);
    const id = p.user;
    const rep = db.reputation.get(id) ?? { id, subject: p.user, accuracy: 0, pnl: 0, markets: 0, isAgent: !!agent };
    const wins = Math.round(rep.accuracy * rep.markets) + (won ? 1 : 0);
    rep.markets += 1;
    rep.accuracy = wins / rep.markets;
    db.reputation.put(rep);
    if (agent) db.agents.patch(agent.id, won ? { wins: agent.wins + 1 } : { losses: agent.losses + 1 });
  }
}

async function tick() {
  const latest = await publicClient.getBlockNumber();
  let cursor = BigInt(kv.get<string>("indexedBlock", config.deployBlock.toString()));
  if (cursor >= latest) return;

  const toBlock = cursor + CHUNK < latest ? cursor + CHUNK : latest;
  const fromBlock = cursor + 1n;

  // 1) new markets from the factory
  const created = await publicClient.getLogs({
    address: config.factory,
    event: factoryAbi[5] as any, // MarketCreated
    fromBlock,
    toBlock,
  });
  for (const log of created) {
    const a = (log as any).args;
    const id = Number(a.id);
    if (db.markets.get(id)) continue;
    const addr = getAddress(a.market);
    const stat = await readMarketStatic(addr);
    db.markets.put({
      id,
      address: addr,
      question: stat.question as string,
      metadataURI: stat.metadataURI as string,
      collateral: stat.collateral as string,
      creator: getAddress(a.creator),
      closeTime: stat.closeTime,
      createdAt: Date.now(),
      priceYes: 0.5,
      volume: 0,
      resolved: false,
    });
  }

  // 2) Buy / Resolved on known markets
  const markets = db.markets.all();
  const addresses = markets.map((m) => m.address as `0x${string}`);
  if (addresses.length) {
    const logs = await publicClient.getLogs({
      address: addresses,
      events: [marketAbi.find((x: any) => x.name === "Buy"), marketAbi.find((x: any) => x.name === "Resolved")] as any,
      fromBlock,
      toBlock,
    });
    for (const log of logs) {
      const m = markets.find((x) => x.address.toLowerCase() === (log.address as string).toLowerCase());
      if (!m) continue;
      const a = (log as any).args;
      if ((log as any).eventName === "Buy") {
        const amountUsdc = fromUsdc(a.amountIn);
        const shares = fromUsdc(a.tokensOut);
        const user = getAddress(a.user);
        const isAgent = !!db.agents.find((ag) => ag.address.toLowerCase() === user.toLowerCase());
        const blockTs = await blockTimeMs((log as any).blockNumber).catch(() => Date.now());
        db.trades.put({
          id: (log as any).transactionHash + ":" + (log as any).logIndex,
          marketId: m.id, user, outcome: Number(a.outcome), amountUsdc, shares,
          priceYesAfter: Number(a.priceYesAfter) / 1e18, tx: (log as any).transactionHash, ts: Date.now(), blockTs, agent: isAgent,
        });
        addPosition(m.id, user, Number(a.outcome), shares);
        db.markets.patch(m.id, { volume: m.volume + amountUsdc, priceYes: Number(a.priceYesAfter) / 1e18 });
        // human trades get a feed item here; agent trades are posted (with reasoning) by the agent loop
        if (!isAgent) {
          const u = db.users.find((x) => x.address.toLowerCase() === user.toLowerCase());
          db.feed.prepend({
            id: (log as any).transactionHash, ts: Date.now(), kind: "trade", user: u?.name ?? user,
            marketId: m.id, marketQuestion: m.question, outcome: Number(a.outcome), amountUsdc, tx: (log as any).transactionHash,
          });
        }
      } else if ((log as any).eventName === "Resolved") {
        await refreshMarketDynamic(m.id, m.address as `0x${string}`);
        recomputeReputation(m.id, Number(a.outcome));
        db.feed.prepend({
          id: "res:" + m.id + ":" + (log as any).transactionHash, ts: Date.now(), kind: "resolution",
          marketId: m.id, marketQuestion: m.question, outcome: Number(a.outcome), reasoning: a.reason, tx: (log as any).transactionHash,
        });
      }
    }
  }

  // one-time historical trade backfill for any market not yet backfilled (captures
  // trades that predate the market's discovery — e.g. seed markets pre-deployBlock)
  for (const m of db.markets.all().filter((x) => !x.backfilled)) {
    try { await backfillMarketTrades(m, latest); } catch (e) { console.error("[backfill]", m.id, (e as Error).message); }
  }

  // keep prices fresh for open markets (cheap)
  for (const m of markets.filter((x) => !x.resolved)) {
    try { await refreshMarketDynamic(m.id, m.address as `0x${string}`); } catch {}
  }

  kv.set("indexedBlock", toBlock.toString());
}

let running = false;
export function startIndexer() {
  const loop = async () => {
    if (running) return;
    running = true;
    try { await tick(); } catch (e) { console.error("[indexer]", (e as Error).message); }
    running = false;
  };
  loop();
  return setInterval(loop, 5000);
}

// standalone: `npm run indexer`
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("[indexer] starting standalone…");
  startIndexer();
}
