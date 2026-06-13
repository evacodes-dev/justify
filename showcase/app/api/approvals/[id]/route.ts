import { NextResponse } from "next/server";
import type { IDKitResult } from "@worldcoin/idkit";
import { getApproval, updateApproval } from "../../../../lib/approvals-store";
import { getAgent } from "../../../../lib/agent-store";
import { addFeed, type FeedPost } from "../../../../lib/feed-store";
import { executeAgentBet } from "../../../../lib/agent-exec";
import { txUrl } from "../../../../lib/arc";
import { DEMO_MARKETS } from "../../../showcase/demo-markets";

// Human-in-the-loop decision on a pending large bet.
// POST { action: "approve" | "reject", rp_id?, idkitResponse? }
// approve REQUIRES a fresh World ID proof (proof-of-human) — verified against the
// Developer Portal — before the agent's bet is executed on-chain. reject just closes it.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { action, rp_id, idkitResponse } = (await req.json()) as {
    action: "approve" | "reject";
    rp_id?: string;
    idkitResponse?: IDKitResult;
  };

  const appr = getApproval(id);
  if (!appr) return NextResponse.json({ error: "unknown approval" }, { status: 404 });
  if (appr.status !== "pending") return NextResponse.json({ error: `already ${appr.status}` }, { status: 409 });

  if (action === "reject") {
    updateApproval(id, { status: "rejected" });
    addFeed({ ts: Date.now(), agent: appr.agent, action: "skip", marketId: appr.marketId, marketQuestion: appr.marketQuestion,
      reasoning: `Human REJECTED the ${appr.side} $${appr.amountUsdc} bet. Not executed.`, status: "done" } as FeedPost);
    return NextResponse.json({ status: "rejected" });
  }

  // approve → verify World ID proof-of-human first
  if (!idkitResponse || !rp_id) return NextResponse.json({ error: "World ID proof required to approve" }, { status: 400 });
  const portal = await fetch(`https://developer.world.org/api/v4/verify/${rp_id}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(idkitResponse),
  });
  if (!portal.ok) {
    const portalBody = await portal.json().catch(() => ({}));
    return NextResponse.json({ error: "World ID verification failed", portal: portalBody }, { status: 400 });
  }

  const agent = getAgent(appr.agentId);
  const market = DEMO_MARKETS.find((m) => m.id === appr.marketId);
  if (!agent || !market) return NextResponse.json({ error: "agent/market missing" }, { status: 410 });

  // execute the bet from the agent's wallet, now that a human signed off
  let betHash: string;
  try {
    const r = await executeAgentBet(agent.pk, market.address, appr.side, appr.amountUsdc);
    betHash = r.betHash;
  } catch (e: any) {
    return NextResponse.json({ error: "bet execution failed: " + (e?.shortMessage || e?.message || String(e)) }, { status: 502 });
  }

  updateApproval(id, { status: "approved", tx: betHash });
  addFeed({ ts: Date.now(), agent: appr.agent, action: "bet", marketId: appr.marketId, marketQuestion: appr.marketQuestion,
    side: appr.side, amountUsdc: appr.amountUsdc, reasoning: `Human-approved via World ID. ${appr.reasoning}`,
    tx: betHash, humanBacked: true, status: "done" } as FeedPost);

  return NextResponse.json({ status: "approved", tx: betHash, txUrl: txUrl(betHash) });
}
