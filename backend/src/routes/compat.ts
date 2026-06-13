import type { FastifyInstance } from "fastify";
import { parseEther } from "viem";
import { config, fromUsdc, toUsdc, txUrl } from "../config.js";
import { backendSigner, publicClient, arc } from "../chain.js";
import { factoryAbi, erc20Abi } from "../abis.js";
import { db, type AgentRow, type FeedItem, type Approval } from "../store.js";
import { signRequest } from "@worldcoin/idkit-core/signing";
import { createAgentInternal } from "./agents.js";
import { tickAgent, executeBuy } from "../agent-loop.js";

// Compatibility layer: serves the `/api/*` contract the SPA front-end already codes
// against (showcase shapes), backed by the REAL FPMM contracts + agent loop. Lets the
// front-end point at this backend with no changes to its api.ts.

const sideOf = (o?: number) => (o === 1 ? "YES" : o === 0 ? "NO" : undefined);

function toPublicAgent(a: AgentRow) {
  return {
    id: a.id, name: a.name, address: a.address, strategy: a.strategy, preset: a.preset,
    owner: a.ownerAddress, humanId: a.ownerHumanId, humanBacked: a.humanBacked,
    record: { w: a.wins, l: a.losses }, budgetUsdc: a.budgetUsdc, spentUsdc: a.spentUsdc, active: a.active,
  };
}

function toFeedPost(f: FeedItem) {
  const action = f.tx && f.amountUsdc ? "bet" : f.status === "awaiting" ? "request_approval" : f.kind === "agent" && f.amountUsdc ? "request_approval" : "skip";
  return {
    ts: f.ts, agent: f.agentName ?? f.user ?? "", action,
    marketId: f.marketId, marketQuestion: f.marketQuestion, side: sideOf(f.outcome),
    amountUsdc: f.amountUsdc, confidence: f.confidence, impliedProb: f.impliedProb, estProb: f.estProb, edge: f.edge,
    reasoning: f.reasoning,
    dataUsed: (f.dataUsed ?? []).map((d: any) => (typeof d === "string" ? { label: d, value: "", source: "" } : d)),
    humanBacked: f.humanBacked, tx: f.tx, status: f.status,
  };
}

function toApproval(a: Approval) {
  return {
    id: a.id, agentId: a.agentId, agent: a.agentName, owner: a.ownerAddress, marketId: a.marketId,
    marketQuestion: a.marketQuestion, side: sideOf(a.outcome), amountUsdc: a.amountUsdc, reasoning: a.reasoning,
    ts: a.ts, status: a.status, tx: a.tx,
  };
}

export async function compatRoutes(app: FastifyInstance) {
  // markets for the on-chain layer (FPMM addresses + live price)
  app.get("/api/markets", async () => ({
    markets: db.markets.all().sort((a, b) => b.createdAt - a.createdAt).map((m) => ({
      id: m.id, address: m.address, question: m.question, metadataURI: m.metadataURI,
      priceYes: m.priceYes, volume: m.volume, resolved: m.resolved, outcome: m.outcome, closeTime: m.closeTime, creator: m.creator,
    })),
  }));

  // dotation: top up an embedded wallet with native USDC
  app.post<{ Body: any }>("/api/dotation", async (req, reply) => {
    const { address } = (req.body ?? {}) as any;
    if (!/^0x[a-fA-F0-9]{40}$/.test(address ?? "")) return reply.code(400).send({ error: "bad address" });
    const bal = fromUsdc((await publicClient.readContract({ address: config.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address] })) as bigint);
    if (bal >= 0.5) return { skipped: true, balance: bal };
    const hash = await backendSigner().run(({ wallet, account }) =>
      wallet.sendTransaction({ to: address as `0x${string}`, value: parseEther("0.5"), account, chain: arc }),
    );
    await publicClient.waitForTransactionReceipt({ hash });
    return { funded: true, hash, amount: 0.5, balance: bal + 0.5 };
  });

  // World ID 4.0 RP signature for the IDKit widget (RP_SIGNING_KEY stays server-side)
  app.post<{ Body: any }>("/api/rp-signature", async (req, reply) => {
    const { action } = (req.body ?? {}) as any;
    if (!process.env.RP_SIGNING_KEY) return reply.code(501).send({ error: "RP_SIGNING_KEY not set" });
    const { sig, nonce, createdAt, expiresAt } = signRequest({ signingKeyHex: process.env.RP_SIGNING_KEY, action });
    return { sig, nonce, created_at: createdAt, expires_at: expiresAt };
  });

  // World ID gate: verify + (on success) dotation + registerCreator + mark verified
  app.get<{ Querystring: { address?: string } }>("/api/verify-proof", async (req) => {
    const addr = String(req.query.address ?? "").toLowerCase();
    const u = db.users.find((x) => x.address.toLowerCase() === addr);
    return { verified: !!u?.verified };
  });
  app.post<{ Body: any }>("/api/verify-proof", async (req, reply) => {
    const { rp_id, idkitResponse, walletAddress, name } = (req.body ?? {}) as any;
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress ?? "")) return reply.code(400).send({ error: "bad walletAddress" });
    // dev bypass (no proof) is allowed unless ALLOW_DEV_VERIFY=false — flip that env to require real World ID
    if (!idkitResponse && process.env.ALLOW_DEV_VERIFY === "false")
      return reply.code(400).send({ error: "World ID proof required (dev bypass disabled)" });
    let nullifier: string | undefined;
    if (idkitResponse && rp_id) {
      const portal = await fetch(`https://developer.world.org/api/v4/verify/${rp_id}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(idkitResponse),
      });
      if (!portal.ok) return reply.code(400).send({ error: "World ID verification failed", portal: await portal.json().catch(() => ({})) });
      nullifier = (idkitResponse?.responses ?? []).map((r: any) => r?.nullifier).find(Boolean);
    }
    // dotation + registerCreator (best-effort, idempotent)
    let arcTx: string | undefined;
    try {
      const bal = fromUsdc((await publicClient.readContract({ address: config.usdc, abi: erc20Abi, functionName: "balanceOf", args: [walletAddress] })) as bigint);
      if (bal < 0.1) {
        const fundTx = await backendSigner().run(({ wallet, account }) => wallet.sendTransaction({ to: walletAddress, value: parseEther("0.2"), account, chain: arc }));
        await publicClient.waitForTransactionReceipt({ hash: fundTx });
      }
      const already = await publicClient.readContract({ address: config.factory, abi: factoryAbi, functionName: "isCreator", args: [walletAddress] });
      if (!already) {
        arcTx = await backendSigner().run(({ wallet, account }) => wallet.writeContract({ address: config.factory, abi: factoryAbi, functionName: "registerCreator", args: [walletAddress], account, chain: arc }));
        await publicClient.waitForTransactionReceipt({ hash: arcTx as `0x${string}` });
      }
    } catch (e) { app.log.error("verify post-actions: " + (e as Error).message); }

    const existing = db.users.find((u) => u.address.toLowerCase() === walletAddress.toLowerCase());
    db.users.put({
      id: walletAddress.toLowerCase(), address: walletAddress,
      name: name || existing?.name || walletAddress.slice(0, 8).toLowerCase(),
      verified: true, humanId: nullifier ?? existing?.humanId ?? walletAddress.toLowerCase(),
      createdAt: existing?.createdAt ?? Date.now(), arcTx,
    });
    return { success: true, alreadyVerified: !!existing?.verified };
  });

  // create a market (backend is a registered creator; funds the initial liquidity)
  app.post<{ Body: any }>("/api/create-market", async (req, reply) => {
    const { question } = (req.body ?? {}) as any;
    if (!question || String(question).length < 6) return reply.code(400).send({ error: "question too short" });
    const L = toUsdc(2);
    const closeTime = BigInt(Math.floor(Date.now() / 1000) + 14 * 86400);
    try {
      const deployTx = await backendSigner().run(async ({ wallet, account }) => {
        const allowance = (await publicClient.readContract({ address: config.usdc, abi: erc20Abi, functionName: "allowance", args: [account.address, config.factory] })) as bigint;
        if (allowance < L) {
          const ah = await wallet.writeContract({ address: config.usdc, abi: erc20Abi, functionName: "approve", args: [config.factory, L], account, chain: arc });
          await publicClient.waitForTransactionReceipt({ hash: ah });
        }
        return wallet.writeContract({ address: config.factory, abi: factoryAbi, functionName: "createMarket", args: [config.usdc, question, "ipfs://user", closeTime, L], account, chain: arc });
      });
      await publicClient.waitForTransactionReceipt({ hash: deployTx as `0x${string}` });
      const count = (await publicClient.readContract({ address: config.factory, abi: factoryAbi, functionName: "marketCount" })) as bigint;
      const id = Number(count) - 1;
      const address = (await publicClient.readContract({ address: config.factory, abi: factoryAbi, functionName: "markets", args: [BigInt(id)] })) as string;
      return { address, question, id, explorer: config.explorer, deployTx };
    } catch (e) {
      return reply.code(502).send({ error: "create failed: " + (e as Error).message });
    }
  });

  // agents
  app.get("/api/agents", async () => ({ agents: db.agents.all().map(toPublicAgent) }));
  app.post<{ Body: any }>("/api/agents", async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const r = await createAgentInternal({ name: body.name, preset: body.preset, ownerAddress: body.owner, budgetUsdc: body.budgetUsdc });
    if (!r.ok) return reply.code(r.code).send({ error: r.error, quota: (r as any).quota });
    return { agent: toPublicAgent(r.agent), fundTx: r.fundTx };
  });

  // reasoning feed (GET) + run tick (POST)
  app.get("/api/agent/tick", async () => ({ feed: db.feed.all().sort((a, b) => b.ts - a.ts).slice(0, 100).map(toFeedPost) }));
  app.post<{ Body: any }>("/api/agent/tick", async (req) => {
    const { agentId } = (req.body ?? {}) as any;
    const id = agentId ?? db.agents.all()[0]?.id;
    if (!id) return { action: "skip", reasoning: "no agents", agent: "" };
    await tickAgent(id);
    const latest = db.feed.all().sort((a, b) => b.ts - a.ts)[0];
    return latest ? toFeedPost(latest) : { action: "skip", reasoning: "no feed", agent: "" };
  });

  // approvals
  app.get<{ Querystring: { owner?: string } }>("/api/approvals", async (req) => {
    const owner = String(req.query.owner ?? "").toLowerCase();
    const pending = db.approvals.filter((a) => a.status === "pending");
    return { approvals: (owner ? pending.filter((a) => a.ownerAddress.toLowerCase() === owner) : pending).map(toApproval) };
  });
  app.post<{ Params: { id: string }; Body: any }>("/api/approvals/:id", async (req, reply) => {
    const { action, idkitResponse, rp_id } = (req.body ?? {}) as any;
    const appr = db.approvals.get(req.params.id);
    if (!appr) return reply.code(404).send({ error: "no approval" });
    if (appr.status !== "pending") return reply.code(409).send({ error: `already ${appr.status}` });

    if (action === "reject") {
      db.approvals.patch(appr.id, { status: "rejected" });
      db.feed.prepend({ id: `rej:${appr.id}`, ts: Date.now(), kind: "agent", agent: true, agentName: appr.agentName, marketId: appr.marketId, marketQuestion: appr.marketQuestion, reasoning: `Human REJECTED the ${sideOf(appr.outcome)} $${appr.amountUsdc} bet.` });
      return { status: "rejected" };
    }
    if (idkitResponse && rp_id) {
      const portal = await fetch(`https://developer.world.org/api/v4/verify/${rp_id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(idkitResponse) });
      if (!portal.ok) return reply.code(400).send({ error: "World ID verification failed" });
    }
    const agent = db.agents.get(appr.agentId);
    const market = db.markets.get(appr.marketId);
    if (!agent || !market) return reply.code(410).send({ error: "agent/market missing" });
    try {
      const tx = await executeBuy(agent, market, appr.outcome === 1 ? "YES" : "NO", appr.amountUsdc);
      db.agents.patch(agent.id, { spentUsdc: agent.spentUsdc + appr.amountUsdc });
      db.approvals.patch(appr.id, { status: "approved", tx });
      db.feed.prepend({ id: `appr:${appr.id}`, ts: Date.now(), kind: "agent", agent: true, agentName: agent.name, marketId: market.id, marketQuestion: market.question, outcome: appr.outcome, amountUsdc: appr.amountUsdc, reasoning: `Human-approved via World ID. ${appr.reasoning}`, humanBacked: true, tx });
      return { status: "approved", tx, txUrl: txUrl(tx) };
    } catch (e) {
      return reply.code(502).send({ error: "execution failed: " + (e as Error).message });
    }
  });

  // resolution record (verdict + rationale) for the market page
  app.get<{ Params: { id: string } }>("/api/resolution/:id", async (req, reply) => {
    const m = db.markets.get(Number(req.params.id));
    if (!m || !m.resolved) return reply.code(404).send({ error: "not resolved" });
    return { id: m.id, verdict: m.outcome === 1 ? "YES" : m.outcome === 0 ? "NO" : "INVALID", rationale: m.reason ?? "", model: "claude-sonnet-4-6", at: new Date(m.createdAt).toISOString().slice(0, 10) };
  });
}
