import type { FastifyInstance } from "fastify";
import { parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { config, toUsdc } from "../config.js";
import { backendSigner, publicClient, arc } from "../chain.js";
import { erc20Abi } from "../abis.js";
import { db } from "../store.js";

export const PRESETS: Record<string, string> = {
  "Value Hunter": "Bet against extreme/unlikely outcomes where the crowd looks wrong. Demand a real edge vs the market price.",
  "News Sniper": "React to the latest data for THIS market's topic; take the side the data supports.",
  "Contrarian": "Take the underpriced side of the most lopsided market. Always look for a position, but only bet with edge.",
};

export function humanIdOf(ownerAddress: string): string {
  const u = db.users.find((x) => x.address.toLowerCase() === ownerAddress.toLowerCase());
  return u?.humanId ?? ownerAddress.toLowerCase();
}

// Shared agent-creation (used by /agents and the /api/* compat layer).
export async function createAgentInternal(input: {
  name: string; preset?: string; strategyText?: string; budgetUsdc?: number; ownerAddress: string;
}): Promise<{ ok: true; agent: any; fundTx: string } | { ok: false; code: number; error: string; quota?: boolean }> {
  const name = String(input.name ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 16);
  const preset = input.preset ?? "Contrarian";
  const budgetUsdc = Number(input.budgetUsdc ?? 1);
  if (!name) return { ok: false, code: 400, error: "bad name" };
  if (!/^0x[a-fA-F0-9]{40}$/.test(input.ownerAddress ?? "")) return { ok: false, code: 400, error: "bad ownerAddress" };
  const owner = db.users.find((u) => u.address.toLowerCase() === input.ownerAddress.toLowerCase());
  if (!owner?.verified) return { ok: false, code: 403, error: "owner must be verified (onboard first)" };
  if (db.agents.find((a) => a.name === name)) return { ok: false, code: 409, error: "name taken" };

  const hid = humanIdOf(input.ownerAddress);
  const mine = db.agents.filter((a) => a.ownerHumanId === hid);
  if (mine.length >= config.maxAgentsPerHuman)
    return { ok: false, code: 429, error: `agent quota reached (${config.maxAgentsPerHuman} per human)`, quota: true };

  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);
  const fundUsdc = Math.min(budgetUsdc, 1) + 0.2;
  const fundTx = await backendSigner().run(({ wallet, account: from }) =>
    wallet.sendTransaction({ to: account.address, value: parseEther(String(fundUsdc)), account: from, chain: arc }),
  );
  await publicClient.waitForTransactionReceipt({ hash: fundTx });

  const strategy = input.strategyText?.trim() || `${preset}: ${PRESETS[preset] ?? PRESETS["Contrarian"]}`;
  const agent = db.agents.put({
    id: account.address.slice(2, 10), name, ownerHumanId: hid, ownerAddress: input.ownerAddress.toLowerCase(),
    address: account.address, pk, strategy, preset, budgetUsdc, spentUsdc: 0,
    active: true, humanBacked: false, createdAt: Date.now(), wins: 0, losses: 0,
  });
  return { ok: true, agent, fundTx };
}

export async function agentRoutes(app: FastifyInstance) {
  // anti-sybil counter for the UI: "You: 2/3 agents · 7/10 trial bets"
  app.get<{ Querystring: { ownerAddress?: string } }>("/agents/quota", async (req) => {
    const owner = String(req.query.ownerAddress ?? "");
    const hid = humanIdOf(owner);
    const mine = db.agents.filter((a) => a.ownerHumanId === hid);
    const trialUsed = mine.reduce((n, a) => n + a.wins + a.losses, 0);
    return {
      agents: mine.length, maxAgents: config.maxAgentsPerHuman,
      freeTrialUsed: trialUsed, freeTrialMax: config.freeTrialBets,
    };
  });

  // POST /agents { name, preset, strategyText?, budgetUsdc, ownerAddress }  (verified owner)
  app.post<{ Body: any }>("/agents", async (req, reply) => {
    const r = await createAgentInternal((req.body ?? {}) as any);
    if (!r.ok) return reply.code(r.code).send({ error: r.error, quota: (r as any).quota });
    return { ok: true, agentName: r.agent.name, walletAddr: r.agent.address };
  });

  // pause / resume
  app.post<{ Params: { id: string }; Body: { active: boolean } }>("/agents/:id/active", async (req, reply) => {
    const a = db.agents.get(req.params.id);
    if (!a) return reply.code(404).send({ error: "not found" });
    db.agents.patch(a.id, { active: !!req.body?.active });
    return { ok: true, active: !!req.body?.active };
  });
}
