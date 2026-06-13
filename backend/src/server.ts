import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { db } from "./store.js";
import { startIndexer } from "./indexer.js";
import { tickAllAgents } from "./agent-loop.js";
import { resolveDueMarkets } from "./resolution.js";
import { registerWriteRoutes } from "./routes/index.js";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

// ─────────── health / config ───────────
app.get("/health", async () => ({ ok: true, chainId: config.chainId, factory: config.factory }));
app.get("/config", async () => ({
  chainId: config.chainId,
  rpc: config.arcRpc,
  explorer: config.explorer,
  factory: config.factory,
  resolver: config.resolver,
  usdc: config.usdc,
  usdcDecimals: config.usdcDecimals,
  approvalThresholdUsdc: config.approvalThresholdUsdc,
}));

// ─────────── read: markets ───────────
app.get("/markets", async () => ({ markets: db.markets.all().sort((a, b) => b.createdAt - a.createdAt) }));
app.get<{ Params: { id: string } }>("/markets/:id", async (req, reply) => {
  const m = db.markets.get(Number(req.params.id));
  if (!m) return reply.code(404).send({ error: "not found" });
  const trades = db.trades.filter((t) => t.marketId === m.id).sort((a, b) => a.ts - b.ts);
  return { market: m, trades };
});

// ─────────── read: feed ───────────
app.get("/feed", async () => ({ feed: db.feed.all().sort((a, b) => b.ts - a.ts).slice(0, 100) }));

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
  app.log.info(`Justify backend on :${port} (Arc ${config.chainId})`);
  startIndexer();
  // agent loop + auto-resolution crons (env AGENT_LOOP=off to disable)
  if (process.env.AGENT_LOOP !== "off") {
    setInterval(() => tickAllAgents().catch((e) => app.log.error("[agents] " + e.message)), 120_000);
    setInterval(() => resolveDueMarkets().catch((e) => app.log.error("[resolve] " + e.message)), 120_000);
  }
});
