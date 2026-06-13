import { config, MODELS, toUsdc, fromUsdc, txUrl } from "./config.js";
import { makeSigner, publicClient, arc } from "./chain.js";
import { erc20Abi, marketAbi } from "./abis.js";
import { db, type AgentRow, type Market } from "./store.js";
import { getRelevantData, impliedYesProb } from "./market-intel.js";
import { claudeJson } from "./llm.js";

const EDGE_MIN = 0.08;
const AMOUNT_MIN = 0.05;
const AMOUNT_MAX = 0.5;

const SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["bet", "skip", "request_approval"] },
    marketId: { type: "integer" },
    outcome: { type: "string", enum: ["YES", "NO"] },
    amountUsdc: { type: "number" },
    estProb: { type: "number" },
    confidence: { type: "number" },
    reasoning: { type: "string" },
    dataUsed: { type: "array", items: { type: "string" } },
  },
  required: ["action", "reasoning"],
  additionalProperties: false,
};
type Decision = {
  action: "bet" | "skip" | "request_approval";
  marketId?: number; outcome?: "YES" | "NO"; amountUsdc?: number;
  estProb?: number; confidence?: number; reasoning: string; dataUsed?: string[];
};

export async function tickAgent(agentId: string) {
  const agent = db.agents.get(agentId);
  if (!agent) return { error: "no agent" };
  if (!agent.active) return { action: "skip", reasoning: "agent paused" };
  const remaining = agent.budgetUsdc - agent.spentUsdc;
  if (remaining < AMOUNT_MIN) return { action: "skip", reasoning: "budget exhausted" };

  const open = db.markets.all().filter((m) => !m.resolved && m.closeTime * 1000 > Date.now());
  if (!open.length) {
    post(agent, { action: "skip", reasoning: "no open markets" } as Decision, undefined);
    return { action: "skip" };
  }

  // topic-aware data per market
  const enriched = await Promise.all(
    open.map(async (m) => ({ m, data: await getRelevantData(m.question, m.metadataURI) })),
  );
  const lines = enriched
    .map(({ m, data }) =>
      `#${m.id} "${m.question}"\n  market-implied YES: ${(m.priceYes * 100).toFixed(0)}% (volume $${m.volume.toFixed(2)})\n  data: ${data.map((d) => `${d.label}=${d.value}`).join("; ")}`,
    )
    .join("\n");

  const forceBet = agent.preset === "Contrarian";
  const decision = await claudeJson<Decision>({
    model: MODELS.agent, // Haiku 4.5
    maxTokens: 700,
    system: `You are autonomous prediction-market trader "${agent.name}". Strategy: ${agent.strategy}\n\nIMPORTANT: a market sitting at exactly 50% with ~$0 volume is the AMM's initial seed price, NOT crowd wisdom — treat it as uninformed and trust your own estimate. For ONE market: estimate the TRUE probability of YES (0..1) from the topic data + priors; the EDGE is |your estimate − market-implied|. ${forceBet ? `Your strategy REQUIRES a position every tick — do NOT skip. Pick the market where your estimate diverges most from the seed price and buy that side (YES if your estimate > implied, else NO).` : `Bet only if edge >= ${EDGE_MIN} AND it fits your strategy, else action="skip". Buy the underpriced side (YES if your estimate > implied, else NO).`} Size amountUsdc in [${AMOUNT_MIN}, ${Math.min(AMOUNT_MAX, remaining).toFixed(2)}]. If amountUsdc > ${config.approvalThresholdUsdc}, use action="request_approval". List exactly what you used in dataUsed.`,
    user: `Open markets:\n${lines}\n\nDecide ONE action now. Return action, marketId, outcome (YES/NO), amountUsdc, estProb, confidence, reasoning (2-3 sentences), dataUsed.`,
    schema: SCHEMA,
  });

  const market = open.find((m) => m.id === decision.marketId);

  if (decision.action === "skip" || !market || !decision.outcome) {
    post(agent, { ...decision, action: "skip" }, market);
    return { action: "skip", reasoning: decision.reasoning };
  }

  const amount = Math.min(Math.max(decision.amountUsdc ?? 0.1, AMOUNT_MIN), Math.min(AMOUNT_MAX, remaining));

  // human-in-the-loop for large bets
  if (decision.action === "request_approval" || amount > config.approvalThresholdUsdc) {
    const id = `${agent.id}-${market.id}-${Date.now()}`;
    db.approvals.put({
      id, agentId: agent.id, agentName: agent.name, ownerAddress: agent.ownerAddress,
      marketId: market.id, marketQuestion: market.question, outcome: decision.outcome === "YES" ? 1 : 0,
      amountUsdc: amount, reasoning: decision.reasoning, ts: Date.now(), status: "pending",
    });
    post(agent, { ...decision, action: "request_approval", amountUsdc: amount }, market, undefined, "awaiting");
    return { action: "request_approval", approvalId: id };
  }

  // execute the buy from the agent's own wallet
  const tx = await executeBuy(agent, market, decision.outcome, amount);
  db.agents.patch(agent.id, { spentUsdc: agent.spentUsdc + amount });
  post(agent, { ...decision, action: "bet", amountUsdc: amount }, market, tx);
  return { action: "bet", outcome: decision.outcome, amountUsdc: amount, tx };
}

export async function executeBuy(agent: AgentRow, market: Market, outcome: "YES" | "NO", amount: number): Promise<string> {
  const signer = makeSigner(agent.pk as `0x${string}`);
  const amt = toUsdc(amount);
  const side = outcome === "YES" ? 1 : 0;
  return signer.run(async ({ wallet, account }) => {
    const allowance = (await publicClient.readContract({
      address: config.usdc, abi: erc20Abi, functionName: "allowance", args: [account.address, market.address as `0x${string}`],
    })) as bigint;
    if (allowance < amt) {
      const ah = await wallet.writeContract({ address: config.usdc, abi: erc20Abi, functionName: "approve", args: [market.address as `0x${string}`, amt], account, chain: arc });
      await publicClient.waitForTransactionReceipt({ hash: ah });
    }
    const tx = await wallet.writeContract({ address: market.address as `0x${string}`, abi: marketAbi, functionName: "buy", args: [side, amt], account, chain: arc });
    await publicClient.waitForTransactionReceipt({ hash: tx });
    return tx;
  });
}

function post(agent: AgentRow, d: Decision, market?: Market, tx?: string, status?: string) {
  const implied = market ? impliedYesProb(market.priceYes) : undefined;
  const edge = market && d.estProb != null ? Math.abs(d.estProb - implied!) : undefined;
  db.feed.prepend({
    id: `agent:${agent.id}:${Date.now()}`, ts: Date.now(), kind: "agent", agent: true, agentName: agent.name,
    marketId: market?.id, marketQuestion: market?.question,
    outcome: d.outcome === "YES" ? 1 : d.outcome === "NO" ? 0 : undefined,
    amountUsdc: d.action === "bet" || d.action === "request_approval" ? d.amountUsdc : undefined,
    reasoning: d.reasoning, confidence: d.confidence, estProb: d.estProb, impliedProb: implied, edge,
    dataUsed: d.dataUsed, humanBacked: agent.humanBacked, tx, status,
  });
}

export async function tickAllAgents() {
  const active = db.agents.filter((a) => a.active && a.budgetUsdc - a.spentUsdc >= AMOUNT_MIN);
  for (const a of active) {
    try { await tickAgent(a.id); } catch (e) { console.error(`[agent ${a.name}]`, (e as Error).message); }
  }
}
