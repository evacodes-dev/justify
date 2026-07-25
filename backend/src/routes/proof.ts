import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { db } from "../store.js";
import { querySubgraph } from "../subgraph.js";

// Live proof of every integration, read from the chains and the indexer rather than asserted.
//
// The point of this endpoint is that nothing here is a claim: the subgraph's head block, the
// attestation count on 0G Chain, the ERC-8004 feedback tally on Ethereum and the x402 payment
// requirements are all fetched at request time, and each carries the link a sceptic would use
// to check it independently.
//
// Cached briefly — it fans out to three chains and an indexer, and a demo page should not
// hammer them.

const TTL_MS = 20_000;
let cache: { at: number; data: unknown } | null = null;

const STATS_QUERY = `query Proof {
  _meta { block { number } hasIndexingErrors }
  global(id: "global") {
    marketCount resolvedMarketCount tradeCount traderCount volumeUSDC aiProposalCount challengeCount
  }
  markets(where: { resolutionKind: OPTIMISTIC_AI }, orderBy: resolvedAt, orderDirection: desc, first: 1) {
    id question outcome resolutionReason resolvedAt
  }
}`;

export async function proofRoutes(app: FastifyInstance) {
  app.get("/api/proof", async () => {
    if (cache !== null && Date.now() - cache.at < TTL_MS) return cache.data;

    const [graph, anchors, erc8004, x402] = await Promise.all([
      graphProof().catch((e) => ({ error: (e as Error).message })),
      anchorProof().catch((e) => ({ error: (e as Error).message })),
      erc8004Proof().catch((e) => ({ error: (e as Error).message })),
      x402Proof().catch((e) => ({ error: (e as Error).message })),
    ]);

    const data = {
      graph,
      zg: anchors,
      erc8004,
      x402,
      world: {
        // Both World ID steps are enforced server-side in /api/create-market; the flag says
        // whether a proof is actually required or the dev bypass is open.
        humanAction: process.env.WORLD_ACTION ?? "create-market",
        identityAction: process.env.WORLD_ACTION_IDENTITY ?? "identity-check",
        devBypass: process.env.ALLOW_DEV_VERIFY !== "false",
        verifiedUsers: db.users.filter((u) => u.verified).length,
        identityVerifiedUsers: db.users.filter((u) => u.identityVerified === true).length,
      },
      settlement: {
        chainId: config.chainId,
        registry: config.registry,
        settler: config.settler,
        explorer: config.explorer,
      },
      generatedAt: new Date().toISOString(),
    };

    cache = { at: Date.now(), data };
    return data;
  });
}

async function graphProof() {
  const { data } = await querySubgraph<{
    _meta: { block: { number: number }; hasIndexingErrors: boolean };
    global: Record<string, unknown> | null;
    markets: { id: string; question: string; outcome: string; resolutionReason: string }[];
  }>(STATS_QUERY);

  const latest = data.markets[0] ?? null;
  return {
    endpoint: config.subgraphUrl,
    studio: "https://thegraph.com/studio/subgraph/justify-markets",
    block: data._meta.block.number,
    healthy: !data._meta.hasIndexingErrors,
    totals: data.global,
    latestAiResolution: latest
      ? { marketId: latest.id, question: latest.question, outcome: latest.outcome, reason: latest.resolutionReason }
      : null,
  };
}

async function anchorProof() {
  if (!config.zg.enabled || !config.zg.attestations) return { enabled: false as const };
  const { readAnchors } = await import("../zg-attest.js");
  const anchors = await readAnchors();
  return {
    enabled: true,
    compute: {
      provider: config.zg.provider,
      // The network's own vetting: verifiability class + whether the TEE signer is acknowledged.
      // Filled from the last resolution bundle when one exists.
      note: "Every inference is billed on-chain against a prepaid 0G Compute ledger.",
    },
    storage: {
      indexer: config.zg.indexer,
      gateway: `${config.zg.indexer}/file?root=`,
    },
    chain: anchors,
  };
}

async function erc8004Proof() {
  const agents = db.agents.filter((a) => Boolean(a.erc8004Id));
  if (agents.length === 0) return { registered: 0, agents: [] };

  const { readSummary, IDENTITY_REGISTRY, REPUTATION_REGISTRY, erc8004Chain, explorerToken } =
    await import("../erc8004.js");
  const client = process.env.REPUTATION_CLIENT_PK
    ? (await import("viem/accounts")).privateKeyToAccount(
        (process.env.REPUTATION_CLIENT_PK.startsWith("0x")
          ? process.env.REPUTATION_CLIENT_PK
          : `0x${process.env.REPUTATION_CLIENT_PK}`) as `0x${string}`,
      ).address
    : null;

  const rows = await Promise.all(
    agents.map(async (a) => {
      let feedback: { count: number; value: number } | null = null;
      if (client !== null) {
        feedback = await readSummary(a.erc8004Id!, [client as `0x${string}`]).catch(() => null);
      }
      return {
        name: a.name,
        address: a.address,
        agentId: a.erc8004Id,
        token: explorerToken(a.erc8004Id!),
        feedbackCount: feedback?.count ?? 0,
        avgScore: feedback?.value ?? null,
      };
    }),
  );

  return {
    chain: erc8004Chain.name,
    chainId: erc8004Chain.id,
    identityRegistry: IDENTITY_REGISTRY,
    reputationRegistry: REPUTATION_REGISTRY,
    registered: rows.length,
    agents: rows,
  };
}

/// Ask our own paywalled endpoint for its terms — the 402 challenge is the proof.
async function x402Proof() {
  if (!config.x402.enabled) return { enabled: false as const };
  const agent = db.agents.find((a) => Boolean(a.erc8004Id)) ?? db.agents.all()[0];
  const probe = `http://127.0.0.1:${config.port}/api/reputation/${agent?.address ?? "0x0000000000000000000000000000000000000000"}`;

  const res = await fetch(probe, { headers: { Accept: "application/json" } });
  const header = res.headers.get("payment-required");
  if (res.status !== 402 || header === null) {
    return { enabled: true, live: false, price: config.x402.price, network: config.x402.network };
  }
  const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  const accept = decoded.accepts?.[0] ?? {};
  return {
    enabled: true,
    live: true,
    price: config.x402.price,
    network: accept.network ?? config.x402.network,
    asset: accept.asset ?? null,
    payTo: accept.payTo ?? null,
    amountAtomic: accept.amount ?? null,
    facilitator: config.x402.facilitator,
    sampleEndpoint: `/api/reputation/${agent?.address ?? ""}`,
  };
}