import { NextResponse } from "next/server";
import { listAgents } from "../../../../lib/agent-store";
import { agentRef, IDENTITY_REGISTRY, erc8004Chain } from "../../../../lib/erc8004";

// ERC-8004 registration file — the target of the agent's `agentURI` (= tokenURI on
// the Identity Registry). Resolvable JSON so judges can click tokenURI on Etherscan
// and see the agent's identity, ENS name, strategy and on-chain ref. Keyed by the
// agent's wallet address (known before register(), so agentURI is stable).
export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ addr: string }> }) {
  const { addr } = await ctx.params;
  const a = listAgents().find((x) => x.address.toLowerCase() === addr.toLowerCase());
  if (!a) return NextResponse.json({ error: "unknown agent" }, { status: 404 });

  // ERC-8004 / A2A-flavoured registration JSON.
  const card = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration",
    name: a.ens ?? `${a.name}-bot`,
    description: `Autonomous prediction-market trading agent on Justify. Strategy: ${a.preset}.`,
    agentWallet: a.address,
    registrations: a.erc8004Id
      ? [{ agentId: a.erc8004Id, agentRegistry: `eip155:${erc8004Chain.id}:${IDENTITY_REGISTRY}`, agentRef: agentRef(a.erc8004Id) }]
      : [],
    ens: a.ens ?? null,
    skills: ["prediction-market-trading", "calibrated-probability-estimation"],
    services: [{ name: "Justify", url: "https://justify.market" }],
    publishedAt: a.createdAt,
  };
  return NextResponse.json(card, { headers: { "cache-control": "public, max-age=30" } });
}
