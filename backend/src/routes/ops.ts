import type { FastifyInstance } from "fastify";
import { db } from "../store.js";
import { tickAgent, tickAllAgents, executeBuy } from "../agent-loop.js";
import { resolveMarket } from "../resolution.js";
import { verifyWorldProof } from "../util.js";

// Demo/ops endpoints: run an agent on demand, resolve a market, manage approvals.
export async function opsRoutes(app: FastifyInstance) {
  // run one agent now
  app.post<{ Params: { id: string } }>("/agents/:id/tick", async (req, reply) => {
    const a = db.agents.get(req.params.id);
    if (!a) return reply.code(404).send({ error: "not found" });
    return await tickAgent(a.id);
  });

  // run all active agents now
  app.post("/tick-all", async () => {
    await tickAllAgents();
    return { ok: true };
  });

  // resolve a market now (after closeTime) via LLM + on-chain reason
  app.post<{ Params: { id: string } }>("/resolve/:id", async (req, reply) => {
    const res = await resolveMarket(Number(req.params.id));
    if ((res as any).error) return reply.code(400).send(res);
    return res;
  });

  // pending approvals (human-in-the-loop)
  app.get<{ Querystring: { ownerAddress?: string } }>("/approvals", async (req) => {
    const owner = String(req.query.ownerAddress ?? "").toLowerCase();
    const all = db.approvals.filter((a) => a.status === "pending");
    return { approvals: owner ? all.filter((a) => a.ownerAddress.toLowerCase() === owner) : all };
  });

  // approve / reject a pending agent bet (optionally gated by World ID proof)
  app.post<{ Params: { id: string }; Body: any }>("/agents/:id/approve", async (req, reply) => {
    const { approvalId, decision, idkitResponse, rp_id } = (req.body ?? {}) as any;
    const appr = db.approvals.get(approvalId);
    if (!appr) return reply.code(404).send({ error: "no approval" });
    if (appr.status !== "pending") return reply.code(409).send({ error: `already ${appr.status}` });

    if (decision === "reject") {
      db.approvals.patch(appr.id, { status: "rejected" });
      db.feed.prepend({ id: `rej:${appr.id}`, ts: Date.now(), kind: "agent", agent: true, agentName: appr.agentName, marketId: appr.marketId, marketQuestion: appr.marketQuestion, reasoning: `Human REJECTED the ${appr.outcome ? "YES" : "NO"} $${appr.amountUsdc} bet.` });
      return { status: "rejected" };
    }

    // optional World ID proof-of-human gate
    if (idkitResponse && rp_id) {
      try {
        await verifyWorldProof(rp_id, idkitResponse);
      } catch {
        return reply.code(400).send({ error: "World ID verification failed" });
      }
    }

    const agent = db.agents.get(appr.agentId);
    const market = db.markets.get(appr.marketId);
    if (!agent || !market) return reply.code(410).send({ error: "agent/market missing" });

    try {
      const tx = await executeBuy(agent, market, appr.outcome === 1 ? "YES" : "NO", appr.amountUsdc);
      db.agents.patch(agent.id, { spentUsdc: agent.spentUsdc + appr.amountUsdc });
      db.approvals.patch(appr.id, { status: "approved", tx });
      db.feed.prepend({ id: `appr:${appr.id}`, ts: Date.now(), kind: "agent", agent: true, agentName: agent.name, marketId: market.id, marketQuestion: market.question, outcome: appr.outcome, amountUsdc: appr.amountUsdc, reasoning: `Human-approved via World ID. ${appr.reasoning}`, humanBacked: true, tx });
      return { status: "approved", tx };
    } catch (e) {
      return reply.code(502).send({ error: "execution failed: " + (e as Error).message });
    }
  });
}
