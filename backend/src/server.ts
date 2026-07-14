import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { db } from "./store.js";
import { startIndexer } from "./indexer.js";
import { tickAllAgents } from "./agent-loop.js";
import { resolveDueMarkets } from "./resolution.js";
import { registerWriteRoutes } from "./routes/index.js";
import { initPgStore, pgEnabled } from "./pg-store.js";

// BE12 — hydrate the durable Postgres store into the local cache before anything reads it.
if (pgEnabled) {
  try {
    await initPgStore();
    console.log("[pg-store] durability enabled (Postgres source of truth)");
  } catch (e) {
    console.error("[pg-store] init failed, continuing file-only:", (e as Error).message);
  }
}

// trustProxy: prod sits behind nginx — rate limiting must key on the real client IP
const app = Fastify({ logger: true, trustProxy: true });
await app.register(cors, { origin: true });
// global per-IP throttle; write routes set stricter per-route limits via config.rateLimit
await app.register(import("@fastify/rate-limit"), { max: 300, timeWindow: "1 minute" });

// The product stack is CTF-only: a deployed MarketRegistry is required.
if (!config.registry) {
  console.error(
    `[boot] no MarketRegistry in contracts/deployments/${config.network}.json — deploy with ` +
      "script/DeployCtf.s.sol and fill in the addresses (see contracts/.env.example).",
  );
  process.exit(1);
}

// ─────────── health / config ───────────
app.get("/health", async () => ({ ok: true, chainId: config.chainId, registry: config.registry }));
const configPayload = async () => ({
  chainId: config.chainId,
  rpc: config.arcRpc,
  explorer: config.explorer,
  registry: config.registry,
  ctf: config.ctf,
  resolver: config.resolver,
  settler: config.settler ?? null,
  usdc: config.usdc,
  usdcDecimals: config.usdcDecimals,
  approvalThresholdUsdc: config.approvalThresholdUsdc,
  createMode: config.createMode,
});
app.get("/config", configPayload);
app.get("/api/config", configPayload); // /api/* alias — prod nginx only proxies /api

// ─────────── read: markets ───────────
app.get("/markets", async () => ({ markets: db.markets.all().sort((a, b) => b.createdAt - a.createdAt) }));
app.get<{ Params: { id: string } }>("/markets/:id", async (req, reply) => {
  const m = db.markets.get(Number(req.params.id));
  if (!m) return reply.code(404).send({ error: "not found" });
  const trades = db.trades.filter((t) => t.marketId === m.id).sort((a, b) => a.ts - b.ts);
  return { market: m, trades };
});

// ─────────── read: feed ───────────
const feedPayload = async () => ({ feed: db.feed.all().sort((a, b) => b.ts - a.ts).slice(0, 100) });
app.get("/feed", feedPayload);
app.get("/api/feed", feedPayload); // /api/* alias — prod nginx only proxies /api

// ─────────── read: leaderboard ───────────
app.get("/leaderboard", async () => {
  const rows = db.reputation.all();
  const humans = rows.filter((r) => !r.isAgent).sort((a, b) => b.accuracy - a.accuracy);
  const agents = rows.filter((r) => r.isAgent).sort((a, b) => b.accuracy - a.accuracy);
  return { humans, agents };
});

// ─────────── read: profiles ───────────
app.get<{ Params: { name: string } }>("/profile/:name", async (req, reply) => {
  const u = db.users.find((x) => x.name === req.params.name);
  if (!u) return reply.code(404).send({ error: "not found" });
  const rep = db.reputation.get(u.address.toLowerCase());
  const trades = db.trades.filter((t) => t.user.toLowerCase() === u.address.toLowerCase());
  return { user: u, reputation: rep ?? null, trades };
});

app.get("/agents", async () => ({
  agents: db.agents.all().map(({ pk, ...a }) => a),
}));
app.get<{ Params: { name: string } }>("/agents/:name", async (req, reply) => {
  const a = db.agents.find((x) => x.name === req.params.name);
  if (!a) return reply.code(404).send({ error: "not found" });
  const { pk, ...pub } = a;
  const feed = db.feed.filter((f) => f.agentName === a.name).slice(0, 30);
  return { agent: pub, feed };
});

// ─────────── write routes (onboard, agents, deposits, approve) ───────────
await registerWriteRoutes(app);

const port = config.port;
app.listen({ port, host: "0.0.0.0" }).then(() => {
  app.log.info(`Justify backend on :${port} (${config.network} ${config.chainId})`);
  startIndexer();
  // auto-resolution cron always runs; agent loop only when the agents feature is on
  if (process.env.AGENT_LOOP !== "off") {
    if (config.features.agents) {
      setInterval(() => tickAllAgents().catch((e) => app.log.error("[agents] " + e.message)), 120_000);
    }
    setInterval(() => resolveDueMarkets().catch((e) => app.log.error("[resolve] " + e.message)), 120_000);
  }
});
