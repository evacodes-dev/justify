import { NextResponse } from "next/server";
import { createWalletClient, createPublicClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { claudeJson, MODELS } from "../../../../lib/claude";
import { addFeed, listFeed, type FeedPost } from "../../../../lib/feed-store";
import { getAgent, listAgents } from "../../../../lib/agent-store";
import { addApproval } from "../../../../lib/approvals-store";
import { summarizeLessons } from "../../../../lib/agent-memory";
import { getRelevantData, impliedYesProb } from "../../../../lib/market-intel";
import { DEMO_MARKETS, USDC_ABI, MARKET_ABI } from "../../../showcase/demo-markets";

// One AI-agent iteration (Block 4 decision quality):
// read live markets + topic-relevant data → Claude estimates calibrated YES prob
// → bets only on edge vs market-implied prob → real bet OR human-in-the-loop request.
export const runtime = "nodejs";
export const maxDuration = 60;

const ARC_RPC = process.env.ARC_RPC ?? "https://rpc.testnet.arc.network";
const USDC = "0x3600000000000000000000000000000000000000" as `0x${string}`;
const arc = defineChain({ id: 5042002, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [ARC_RPC] } } });

const EDGE_MIN = 0.08;                 // bet only if |est - implied| >= 8pp
const APPROVAL_THRESHOLD = Number(process.env.APPROVAL_THRESHOLD_USDC ?? "0.2"); // > this → human-in-the-loop
const AMOUNT_MIN = 0.05, AMOUNT_MAX = 0.5;

const SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["bet", "skip", "request_approval"] },
    marketId: { type: "integer" },
    side: { type: "string", enum: ["YES", "NO"] },
    amountUsdc: { type: "number" },
    estProb: { type: "number" },     // agent's estimated YES probability 0..1
    confidence: { type: "number" },  // 0..1
    reasoning: { type: "string" },
    dataUsed: { type: "array", items: { type: "string" } },
  },
  required: ["action", "reasoning"],
  additionalProperties: false,
};

type Decision = {
  action: "bet" | "skip" | "request_approval";
  marketId?: number; side?: "YES" | "NO"; amountUsdc?: number;
  estProb?: number; confidence?: number; reasoning: string; dataUsed?: string[];
};

export async function GET() { return NextResponse.json({ feed: listFeed() }); }

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const agent = body.agentId ? getAgent(body.agentId) : listAgents()[0];
  if (!agent) return NextResponse.json({ error: "no agents — create one first" }, { status: 400 });

  const pub = createPublicClient({ chain: arc, transport: http(ARC_RPC) });

  // 1. read live market state + topic-relevant data (parallel, per market)
  const markets = await Promise.all(DEMO_MARKETS.map(async (m) => {
    const [pools, resolved] = await Promise.all([
      pub.readContract({ address: m.address, abi: MARKET_ABI, functionName: "pools" }) as Promise<readonly [bigint, bigint]>,
      pub.readContract({ address: m.address, abi: MARKET_ABI, functionName: "resolved" }) as Promise<boolean>,
    ]);
    const no = Number(pools[0]) / 1e6, yes = Number(pools[1]) / 1e6;
    const data = await getRelevantData(m.question);
    return { id: m.id, address: m.address, question: m.question, no, yes, resolved, impliedYes: impliedYesProb(yes, no), data };
  }));
  const open = markets.filter((m) => !m.resolved);
  if (open.length === 0) {
    const post: FeedPost = { ts: Date.now(), agent: agent.ens ?? agent.name, action: "skip", reasoning: "All markets resolved — nothing to trade." };
    addFeed(post); return NextResponse.json(post);
  }

  // 2. structured prompt
  const marketLines = open.map((m) =>
    `#${m.id} "${m.question}"\n   market-implied YES prob: ${(m.impliedYes * 100).toFixed(0)}% (pools YES $${m.yes.toFixed(2)} / NO $${m.no.toFixed(2)})\n   relevant data: ${m.data.map((d) => `${d.label}=${d.value}`).join("; ")}`
  ).join("\n");

  const lessons = summarizeLessons(agent.id); // reflexion: learn from past resolved bets

  const decision = await claudeJson<Decision>({
    model: MODELS.resolution, // sonnet-4-6 for smarter decisions
    maxTokens: 900,
    system: `You are an autonomous prediction-market trading agent named ${agent.ens ?? agent.name}. Strategy: ${agent.strategy}\n\nFor the chosen market: (1) estimate the TRUE probability of YES (0..1) using the relevant data and priors; (2) compare to the market-implied prob; (3) the EDGE is |your estimate − implied|. Only take a position when edge >= ${EDGE_MIN} (8 percentage points) AND it fits your strategy — otherwise action="skip". Bet the underpriced side: if your YES estimate > implied → side YES, else NO. Size amountUsdc between ${AMOUNT_MIN} and ${AMOUNT_MAX}, larger with bigger edge/confidence. If amountUsdc > ${APPROVAL_THRESHOLD}, use action="request_approval" (a human must approve). Never trade resolved markets. List in dataUsed exactly what you looked at.${lessons ? `\n\n--- LEARN FROM YOUR OWN TRACK RECORD ---\n${lessons}` : ""}`,
    user: `Open markets:\n${marketLines}\n\nDecide one action now. Return action, marketId, side, amountUsdc, estProb (your YES probability), confidence, reasoning (2-4 sentences), dataUsed.`,
    schema: SCHEMA,
  });

  const chosen = open.find((m) => m.id === decision.marketId);
  const base: FeedPost = {
    ts: Date.now(), agent: agent.ens ?? agent.name, action: decision.action,
    marketId: decision.marketId, marketQuestion: chosen?.question,
    side: decision.side, amountUsdc: decision.amountUsdc,
    confidence: decision.confidence, estProb: decision.estProb,
    impliedProb: chosen?.impliedYes,
    edge: chosen && decision.estProb != null ? Math.abs(decision.estProb - chosen.impliedYes) : undefined,
    reasoning: decision.reasoning,
    dataUsed: (decision.dataUsed ?? []).map((s) => ({ label: s, value: "", source: "" })),
    humanBacked: !!agent.humanId, // set by AgentKit registration when wired
  };

  // 3a. skip
  if (decision.action === "skip" || !chosen || !decision.side) {
    const post = { ...base, action: "skip" as const, status: "done" as const };
    addFeed(post); return NextResponse.json(post);
  }

  const amount = Math.min(Math.max(decision.amountUsdc ?? 0.1, AMOUNT_MIN), AMOUNT_MAX);

  // 3b. human-in-the-loop: large bet → request approval, don't execute yet
  if (decision.action === "request_approval" || amount > APPROVAL_THRESHOLD) {
    const id = `${agent.id}-${chosen.id}-${Date.now()}`;
    addApproval({ id, agentId: agent.id, agent: agent.ens ?? agent.name, owner: agent.owner ?? "", marketId: chosen.id, marketQuestion: chosen.question, side: decision.side, amountUsdc: amount, reasoning: decision.reasoning, ts: Date.now(), status: "pending" });
    const post = { ...base, action: "request_approval" as const, amountUsdc: amount, status: "awaiting_approval" as const };
    addFeed(post); return NextResponse.json(post);
  }

  // 3c. small bet → execute on-chain from the agent's own wallet
  const account = privateKeyToAccount(agent.pk);
  const wallet = createWalletClient({ account, chain: arc, transport: http(ARC_RPC) });
  const amt = BigInt(Math.round(amount * 1e6));
  const side = decision.side === "YES" ? 1 : 0;
  const allowance = (await pub.readContract({ address: USDC, abi: USDC_ABI, functionName: "allowance", args: [account.address, chosen.address] })) as bigint;
  if (allowance < amt) {
    const ah = await wallet.writeContract({ address: USDC, abi: USDC_ABI, functionName: "approve", args: [chosen.address, amt], account, chain: arc });
    await pub.waitForTransactionReceipt({ hash: ah });
  }
  const tx = await wallet.writeContract({ address: chosen.address, abi: MARKET_ABI, functionName: "bet", args: [side, amt], account, chain: arc });
  await pub.waitForTransactionReceipt({ hash: tx });

  const post = { ...base, action: "bet" as const, amountUsdc: amount, tx, status: "done" as const };
  addFeed(post);
  return NextResponse.json(post);
}
