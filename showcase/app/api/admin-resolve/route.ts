import { NextResponse } from "next/server";
import { createWalletClient, createPublicClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { claudeJson, MODELS } from "../../../lib/claude";
import { saveResolution } from "../../../lib/resolution-store";
import { listFeed } from "../../../lib/feed-store";
import { listAgents } from "../../../lib/agent-store";
import { recordOutcome } from "../../../lib/agent-memory";
import { DEMO_MARKETS } from "../../showcase/demo-markets";

// Showcase — LLM-driven market resolution. Fetches ETH price → Claude returns a
// verdict + rationale → resolve() on Arc (owner key) → store for /market/[id].
export const runtime = "nodejs";

const ARC_RPC = process.env.ARC_RPC ?? "https://rpc.testnet.arc.network";
const arc = defineChain({
  id: 5042002, name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
});
const RESOLVE_ABI = [
  { type: "function", name: "resolve", stateMutability: "nonpayable", inputs: [{ type: "uint8" }], outputs: [] },
  { type: "function", name: "resolved", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
] as const;

const SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["YES", "NO"] },
    rationale: { type: "string" },
  },
  required: ["verdict", "rationale"],
  additionalProperties: false,
};

export async function POST(req: Request) {
  const { id } = await req.json();
  const market = DEMO_MARKETS.find((m) => m.id === Number(id));
  if (!market) return NextResponse.json({ error: "unknown market" }, { status: 400 });

  // 1. fetch ETH price (Coingecko)
  const ethPrice = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd")
    .then((r) => r.json()).then((d) => d?.ethereum?.usd ?? 0).catch(() => 0);

  // 2. LLM verdict + rationale
  const out = await claudeJson<{ verdict: "YES" | "NO"; rationale: string }>({
    model: MODELS.resolution,
    system: "You are an impartial prediction-market resolver. Decide YES or NO for the market question using the current data provided. Be decisive. Write a 2-3 sentence rationale citing the number.",
    user: `Market: "${market.question}"\nCurrent ETH price: $${ethPrice}\nResolve this market now (today is 2026-06-12). Return your verdict and a short rationale.`,
    schema: SCHEMA,
  });

  // 3. resolve on Arc (YES=1, NO=0)
  const account = privateKeyToAccount(process.env.ARC_FAUCET_PK as `0x${string}`);
  const pub = createPublicClient({ chain: arc, transport: http(ARC_RPC) });
  const wallet = createWalletClient({ account, chain: arc, transport: http(ARC_RPC) });
  let tx: string | undefined;
  const already = (await pub.readContract({ address: market.address, abi: RESOLVE_ABI, functionName: "resolved" })) as boolean;
  if (!already) {
    tx = await wallet.writeContract({
      address: market.address, abi: RESOLVE_ABI, functionName: "resolve",
      args: [out.verdict === "YES" ? 1 : 0], account, chain: arc,
    });
    await pub.waitForTransactionReceipt({ hash: tx as `0x${string}` });
  }

  const rec = { id: Number(id), verdict: out.verdict, rationale: out.rationale, ethPrice, tx, model: MODELS.resolution, at: "2026-06-12" };
  saveResolution(rec);

  // Reflexion: record win/loss for every agent that bet on this market (idempotent).
  const agents = listAgents();
  let learned = 0;
  for (const p of listFeed()) {
    if (p.action !== "bet" || p.marketId !== Number(id) || !p.side) continue;
    const ag = agents.find((a) => (a.ens ?? a.name) === p.agent || a.name === p.agent);
    if (!ag) continue;
    recordOutcome(ag.id, { ts: Date.now(), marketId: Number(id), marketQuestion: market.question, side: p.side, estProb: p.estProb, verdict: out.verdict, won: (p.side === "YES") === (out.verdict === "YES") });
    learned++;
  }
  return NextResponse.json({ ...rec, agentsLearned: learned });
}
