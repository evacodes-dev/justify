import type { FastifyInstance } from "fastify";
import { parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { config, toUsdc } from "../config.js";
import { backendSigner, publicClient, arc } from "../chain.js";
import { erc20Abi } from "../abis.js";
import { db } from "../store.js";

const PRESETS: Record<string, string> = {
  "Value Hunter": "Bet against extreme/unlikely outcomes where the crowd looks wrong. Demand a real edge vs the market price.",
  "News Sniper": "React to the latest data for THIS market's topic; take the side the data supports.",
  "Contrarian": "Take the underpriced side of the most lopsided market. Always look for a position, but only bet with edge.",
};

function humanIdOf(ownerAddress: string): string {
  const u = db.users.find((x) => x.address.toLowerCase() === ownerAddress.toLowerCase());
  return u?.humanId ?? ownerAddress.toLowerCase();
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
    const { name: rawName, preset = "Contrarian", strategyText, budgetUsdc = 1, ownerAddress } = (req.body ?? {}) as any;
    const name = String(rawName ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 16);
    if (!name) return reply.code(400).send({ error: "bad name" });
    if (!/^0x[a-fA-F0-9]{40}$/.test(ownerAddress ?? "")) return reply.code(400).send({ error: "bad ownerAddress" });

    const owner = db.users.find((u) => u.address.toLowerCase() === ownerAddress.toLowerCase());
    if (!owner?.verified) return reply.code(403).send({ error: "owner must be verified (onboard first)" });
    if (db.agents.find((a) => a.name === name)) return reply.code(409).send({ error: "name taken" });

    // anti-sybil quota per HUMAN
    const hid = humanIdOf(ownerAddress);
    const mine = db.agents.filter((a) => a.ownerHumanId === hid);
    if (mine.length >= config.maxAgentsPerHuman)
      return reply.code(429).send({ error: `agent quota reached (${config.maxAgentsPerHuman} per human)`, quota: true });

    // 1) generate agent wallet + fund gas + budget on Arc
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    const fundUsdc = Math.min(Number(budgetUsdc), 1) + 0.2; // budget (capped for demo) + gas
    try {
      const tx = await backendSigner().run(({ wallet, account: from }) =>
        wallet.sendTransaction({ to: account.address, value: parseEther(String(fundUsdc)), account: from, chain: arc }),
      );
      await publicClient.waitForTransactionReceipt({ hash: tx });
    } catch (e) {
      return reply.code(502).send({ error: "agent funding failed: " + (e as Error).message });
    }

    // 2) (AgentKit proof-of-human registration is gated on a real World App — see docs.
    //     Anti-sybil is enforced above per humanId; humanBacked flips true once AgentKit reg lands.)
    const strategy = strategyText?.trim() || `${preset}: ${PRESETS[preset] ?? PRESETS["Contrarian"]}`;

    db.agents.put({
      id: account.address.slice(2, 10), name, ownerHumanId: hid, ownerAddress: ownerAddress.toLowerCase(),
      address: account.address, pk, strategy, preset, budgetUsdc: Number(budgetUsdc), spentUsdc: 0,
      active: true, humanBacked: false, createdAt: Date.now(), wins: 0, losses: 0,
    });

    return { ok: true, agentName: name, walletAddr: account.address };
  });

  // pause / resume
  app.post<{ Params: { id: string }; Body: { active: boolean } }>("/agents/:id/active", async (req, reply) => {
    const a = db.agents.get(req.params.id);
    if (!a) return reply.code(404).send({ error: "not found" });
    db.agents.patch(a.id, { active: !!req.body?.active });
    return { ok: true, active: !!req.body?.active };
  });
}
