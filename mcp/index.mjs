#!/usr/bin/env node
// justify-mcp — MCP server exposing AI-resolved prediction markets, indexed by The Graph.
//
// Runs over stdio on the CLIENT's machine (Claude Desktop, Cursor, any MCP-capable agent), so
// it costs the app nothing: it just issues outbound queries to the justify-markets subgraph
// and the Justify API.
//
// The point is that an agent should not have to learn our schema to reason about a market.
// The hosted Subgraph MCP gives any agent raw GraphQL against any subgraph; this one adds the
// domain layer on top — "is this market's price informative?", "what is this agent's track
// record?", "show me the evidence behind that AI resolution" — plus a paid tool that settles
// x402 USDC on Base Sepolia, so an agent can buy data as well as read it.
//
// Zero dependencies: the JSON-RPC framing is implemented here, and x402 payment is loaded
// lazily so the server is useful with nothing installed.

const SUBGRAPH_URL =
  process.env.JUSTIFY_SUBGRAPH_URL ??
  "https://api.studio.thegraph.com/query/1756947/justify-markets/v0.2.0";
const API_URL = process.env.JUSTIFY_API_URL ?? "https://justify.market";
const X402_BUYER_PK = process.env.X402_BUYER_PK ?? "";

// ─────────────────────────── data access ───────────────────────────

async function subgraph(query, variables = {}) {
  const res = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`subgraph HTTP ${res.status}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
  return body.data;
}

const pct = (v) => `${(Number(v) * 100).toFixed(1)}%`;
const usd = (v) => `$${Number(v).toFixed(2)}`;

const MARKETS_QUERY = `query Markets($first: Int!, $status: [MarketStatus!]) {
  markets(first: $first, orderBy: createdAt, orderDirection: desc, where: { status_in: $status }) {
    id question status outcome yesPrice volumeUSDC liquidityUSDC tradeCount traderCount closeTime
  }
}`;

const CONTEXT_QUERY = `query Context($id: ID!) {
  market(id: $id) {
    id question status outcome yesPrice volumeUSDC liquidityUSDC tradeCount traderCount closeTime
    resolutionReason
    pricePoints(orderBy: timestamp, orderDirection: asc, first: 100) { yesPrice timestamp }
    trades(orderBy: timestamp, orderDirection: desc, first: 50) {
      isBuy outcome amountUSDC price yesPriceAfter timestamp trader { id }
    }
  }
}`;

const LEADERBOARD_QUERY = `query Leaderboard($first: Int!) {
  traders(first: $first, orderBy: realizedPnlUSDC, orderDirection: desc, where: { tradeCount_gt: 0 }) {
    id volumeUSDC realizedPnlUSDC tradeCount marketsTraded
  }
  global(id: "global") { marketCount resolvedMarketCount tradeCount traderCount volumeUSDC }
  _meta { block { number } }
}`;

/// The analysis the resolution agent itself runs before judging an outcome: not "what is the
/// price" but "does this price carry information at all".
function analyseMarket(m) {
  const lines = [];
  const price = Number(m.yesPrice);
  lines.push(`Market #${m.id} — "${m.question}"`);
  lines.push(`Status: ${m.status}${m.outcome ? ` (${m.outcome})` : ""}`);
  lines.push(`YES price ${pct(price)} · volume ${usd(m.volumeUSDC)} · liquidity ${usd(m.liquidityUSDC)}`);
  lines.push(`${m.tradeCount} trade(s) by ${m.traderCount} trader(s)`);

  const points = m.pricePoints ?? [];
  if (points.length > 1) {
    const a = Number(points[0].yesPrice);
    const b = Number(points[points.length - 1].yesPrice);
    lines.push(`Price drift: ${pct(a)} → ${pct(b)} (${b >= a ? "+" : ""}${((b - a) * 100).toFixed(1)}pp)`);
  }

  const trades = m.trades ?? [];
  const cutoff = Number(m.closeTime) - 6 * 3600;
  const late = trades.filter((t) => Number(t.timestamp) >= cutoff);
  if (late.length) {
    const yes = late.filter((t) => t.isBuy && t.outcome === "YES").length;
    const no = late.filter((t) => t.isBuy && t.outcome === "NO").length;
    lines.push(`Last 6h before close: ${late.length} trade(s), ${yes} YES buys vs ${no} NO buys`);
  }

  const byTrader = new Map();
  for (const t of trades) {
    byTrader.set(t.trader.id, (byTrader.get(t.trader.id) ?? 0) + Math.abs(Number(t.amountUSDC)));
  }
  const total = [...byTrader.values()].reduce((a, b) => a + b, 0);
  const top = [...byTrader.entries()].sort((x, y) => y[1] - x[1])[0];
  if (top && total > 0) {
    lines.push(
      `Concentration: largest trader is ${pct(top[1] / total)} of sampled volume (${byTrader.size} distinct traders)`,
    );
  }

  const thin = m.tradeCount < 3 || m.traderCount < 2;
  lines.push(
    thin
      ? "VERDICT ON THE DATA: thin market — the price reflects the AMM seed, not crowd belief. Do not treat it as evidence."
      : "VERDICT ON THE DATA: enough participation that the price carries some information; weigh concentration above.",
  );
  return lines.join("\n");
}

// ─────────────────────────── tools ───────────────────────────

const TOOLS = [
  {
    name: "list_markets",
    description:
      "List prediction markets indexed by the justify-markets subgraph, newest first. Returns the pool-derived YES price, volume, liquidity and participation for each.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["OPEN", "CLOSED", "PROPOSED", "CHALLENGED", "RESOLVED", "ANY"],
          description: "Filter by lifecycle status (default ANY).",
        },
        limit: { type: "number", description: "Max markets to return (default 20)." },
      },
    },
  },
  {
    name: "get_market_context",
    description:
      "Analyse ONE market the way the resolution agent does before judging it: price drift, one-sided flow near close, volume concentration, and an explicit judgement on whether the price is informative at all. Use this instead of reading the raw price.",
    inputSchema: {
      type: "object",
      properties: { marketId: { type: "string", description: "Market id, e.g. \"13\"." } },
      required: ["marketId"],
    },
  },
  {
    name: "get_leaderboard",
    description:
      "Trader/agent ranking by realized PnL, computed inside the subgraph with average-cost accounting, plus protocol-wide totals and the indexed head block.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number", description: "Max traders (default 20)." } },
    },
  },
  {
    name: "get_agent_reputation",
    description:
      "Reputation score (0-100) for a trading agent, derived from its on-chain track record against resolved outcomes: hit rate, calibration edge vs entry price, realized PnL and breadth. This endpoint is PAID via x402 ($0.005 USDC on Base Sepolia); set X402_BUYER_PK to settle automatically, otherwise the payment requirements are returned.",
    inputSchema: {
      type: "object",
      properties: { address: { type: "string", description: "Agent wallet address (0x…)." } },
      required: ["address"],
    },
  },
  {
    name: "get_resolution_evidence",
    description:
      "Fetch the justification bundle behind an AI-resolved market: the verdict, the indexed market data the model reasoned over (including the exact GraphQL query), and the 0G Compute attribution. Content-addressed on 0G Storage by Merkle root.",
    inputSchema: {
      type: "object",
      properties: { marketId: { type: "string", description: "Market id of a resolved market." } },
      required: ["marketId"],
    },
  },
  {
    name: "query_subgraph",
    description:
      "Escape hatch: run an arbitrary GraphQL query against the justify-markets subgraph. Entities: Market, Trade, Position, Trader, Creator, PricePoint, Resolution, Global.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "GraphQL query document." },
        variables: { type: "object", description: "Optional variables." },
      },
      required: ["query"],
    },
  },
];

async function callTool(name, args = {}) {
  switch (name) {
    case "list_markets": {
      const status = args.status && args.status !== "ANY" ? [args.status] : null;
      const data = await subgraph(MARKETS_QUERY, {
        first: args.limit ?? 20,
        ...(status ? { status } : { status: ["OPEN", "CLOSED", "PROPOSED", "CHALLENGED", "RESOLVED"] }),
      });
      const rows = data.markets.map(
        (m) =>
          `#${m.id} [${m.status}${m.outcome ? `→${m.outcome}` : ""}] ${pct(m.yesPrice)} YES · ${usd(m.volumeUSDC)} vol · ${m.tradeCount} trades — ${m.question}`,
      );
      return rows.length ? rows.join("\n") : "No markets match that filter.";
    }

    case "get_market_context": {
      const data = await subgraph(CONTEXT_QUERY, { id: String(args.marketId) });
      if (!data.market) return `Market ${args.marketId} is not indexed.`;
      return analyseMarket(data.market);
    }

    case "get_leaderboard": {
      const data = await subgraph(LEADERBOARD_QUERY, { first: args.limit ?? 20 });
      const rows = data.traders.map(
        (t, i) =>
          `${i + 1}. ${t.id} — PnL ${Number(t.realizedPnlUSDC) >= 0 ? "+" : ""}${usd(t.realizedPnlUSDC)} · vol ${usd(t.volumeUSDC)} · ${t.tradeCount} trades across ${t.marketsTraded} market(s)`,
      );
      const g = data.global;
      const totals = g
        ? `\n\nProtocol: ${g.marketCount} markets (${g.resolvedMarketCount} resolved) · ${g.tradeCount} trades · ${g.traderCount} traders · ${usd(g.volumeUSDC)} volume · indexed to block ${data._meta.block.number}`
        : "";
      return (rows.length ? rows.join("\n") : "No traders indexed yet.") + totals;
    }

    case "get_agent_reputation":
      return await fetchReputation(String(args.address));

    case "get_resolution_evidence": {
      const res = await fetch(`${API_URL}/api/resolution/${encodeURIComponent(args.marketId)}`);
      if (!res.ok) return `Market ${args.marketId} has no resolution record yet (HTTP ${res.status}).`;
      const r = await res.json();
      if (!r.bundleUrl) {
        return `Market ${args.marketId} resolved ${r.verdict} via ${r.oracle}. No justification bundle (deterministic oracles publish none).\n\n${r.rationale}`;
      }
      const bundle = await fetch(`${API_URL}${r.bundleUrl}`).then((b) => b.json());
      const c = bundle.compute ?? {};
      return [
        `Market #${args.marketId} resolved ${r.verdict} (${r.oracle}).`,
        `Verdict: ${bundle.verdict?.reasoning ?? r.rationale}`,
        "",
        `Inference: model ${c.model ?? "?"} on provider ${c.provider ?? "?"} (${c.verifiability ?? "?"})`,
        `TEE signer ${c.teeSignerAddress ?? "?"} · acknowledged: ${c.teeSignerAcknowledged}`,
        `Per-response signature checked: ${c.verified === true ? "yes" : `no — ${c.verificationNote ?? "unavailable"}`}`,
        "",
        `Market data the model reasoned over:`,
        bundle.graphData?.summary ?? "(none recorded)",
        "",
        `Bundle: ${r.bundleUri} (content-addressed on 0G Storage)`,
      ].join("\n");
    }

    case "query_subgraph": {
      const data = await subgraph(args.query, args.variables ?? {});
      return JSON.stringify(data, null, 2);
    }

    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

/// The reputation endpoint answers HTTP 402. With a funded key we settle the payment and
/// retry; without one we hand the agent the machine-readable requirements so it can decide.
async function fetchReputation(address) {
  const url = `${API_URL}/api/reputation/${address}`;

  if (X402_BUYER_PK) {
    try {
      const [{ wrapFetchWithPayment, x402Client }, { ExactEvmScheme, toClientEvmSigner }, viem, accounts, chains] =
        await Promise.all([
          import("@x402/fetch"),
          import("@x402/evm"),
          import("viem"),
          import("viem/accounts"),
          import("viem/chains"),
        ]);
      const pk = X402_BUYER_PK.startsWith("0x") ? X402_BUYER_PK : `0x${X402_BUYER_PK}`;
      const account = accounts.privateKeyToAccount(pk);
      const publicClient = viem.createPublicClient({ chain: chains.baseSepolia, transport: viem.http() });
      const client = new x402Client().register(
        "eip155:84532",
        new ExactEvmScheme(toClientEvmSigner(account, publicClient)),
      );
      const res = await wrapFetchWithPayment(fetch, client)(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return `Reputation request failed: HTTP ${res.status}`;
      return formatReputation(await res.json(), account.address);
    } catch (e) {
      return `x402 payment path unavailable (${e.message}). Install @x402/fetch @x402/evm viem, or read the requirements below.\n\n${await paymentRequirements(url)}`;
    }
  }

  return await paymentRequirements(url);
}

async function paymentRequirements(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.ok) return formatReputation(await res.json(), null);
  const header = res.headers.get("payment-required");
  if (res.status === 402 && header) {
    const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    const accept = decoded.accepts?.[0] ?? {};
    return [
      "This tool is paid (x402). No payment key configured, so here are the requirements:",
      `  price:   ${Number(accept.amount ?? 0) / 1e6} USDC`,
      `  asset:   ${accept.asset}`,
      `  network: ${accept.network}`,
      `  payTo:   ${accept.payTo}`,
      "",
      "Set X402_BUYER_PK (a wallet holding Base Sepolia USDC) to have this server settle automatically.",
    ].join("\n");
  }
  return `Reputation request failed: HTTP ${res.status}`;
}

function formatReputation(r, payer) {
  const c = r.components ?? {};
  const s = r.sample ?? {};
  return [
    `Agent ${r.address} — reputation ${r.score}/100`,
    `  hit rate ${pct(c.hitRate ?? 0)} · calibration edge ${pct(c.edgeNorm ?? 0)} · PnL ${pct(c.pnlNorm ?? 0)} · breadth ${pct(c.breadth ?? 0)} · recency ${pct(c.recency ?? 0)}`,
    `  sample: ${s.scoredBuys ?? 0} scored bets across ${s.resolvedMarkets ?? 0} resolved market(s), ${usd(s.volumeUSDC ?? 0)} volume`,
    r.bundle?.uri ? `  report pinned at ${r.bundle.uri}` : "",
    r.erc8004?.agentId ? `  reported to ERC-8004 agent #${r.erc8004.agentId}` : "",
    payer ? `  paid from ${payer}` : "",
    "",
    "Formula: 100 · (0.35·hitRate + 0.30·edge + 0.20·pnl + 0.15·breadth) · recency, resolved markets only.",
  ]
    .filter(Boolean)
    .join("\n");
}

// ─────────────────────────── MCP framing (stdio, JSON-RPC 2.0) ───────────────────────────

const SERVER_INFO = { name: "justify-mcp", version: "1.0.0" };

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    return {
      protocolVersion: params?.protocolVersion ?? "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    };
  }
  if (method === "tools/list") return { tools: TOOLS };
  if (method === "tools/call") {
    try {
      const text = await callTool(params?.name, params?.arguments ?? {});
      return { content: [{ type: "text", text }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  }
  if (method === "ping") return {};
  const err = new Error(`method not found: ${method}`);
  err.code = -32601;
  throw err;
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    // Notifications carry no id and expect no reply.
    if (msg.id === undefined) continue;
    try {
      const result = await handle(msg);
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }) + "\n");
    } catch (e) {
      process.stdout.write(
        JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: e.code ?? -32603, message: e.message } }) + "\n",
      );
    }
  }
});

process.stdin.on("end", () => process.exit(0));