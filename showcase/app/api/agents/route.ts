import { NextResponse } from "next/server";
import { createWalletClient, createPublicClient, defineChain, http, parseEther } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { addAgent, listAgents, publicAgent, type Agent } from "../../../lib/agent-store";
import { recordStats } from "../../../lib/agent-memory";

// Create a user-owned AI agent: generate a fresh wallet, fund it from the faucet,
// mint its ENS identity, store it. Each agent trades from its OWN wallet.
export const runtime = "nodejs";

const ARC_RPC = process.env.ARC_RPC ?? "https://rpc.testnet.arc.network";
const arc = defineChain({ id: 5042002, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [ARC_RPC] } } });

const PRESETS: Record<string, string> = {
  "Value Hunter": "bet against extreme/unlikely outcomes; prefer markets where the crowd looks wrong. Bet 0.05-0.2 USDC. Never touch resolved markets.",
  "News Sniper": "react to the current ETH price; take the side the latest price supports. Bet 0.1 USDC. Never touch resolved markets.",
  "Contrarian": "ALWAYS take a position (never skip). Bet 0.1 USDC on the underdog (smaller pool) side of the most lopsided UNRESOLVED market. Never touch resolved markets.",
};

export async function GET() {
  return NextResponse.json({ agents: listAgents().map((a) => ({ ...publicAgent(a), record: recordStats(a.id) })) });
}

export async function POST(req: Request) {
  const { name: rawName, preset = "Contrarian", owner } = await req.json();
  const name = String(rawName ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 16);
  if (!name) return NextResponse.json({ error: "bad name" }, { status: 400 });
  if (listAgents().some((a) => a.name === name)) return NextResponse.json({ error: "name taken" }, { status: 409 });
  const ownerAddr = /^0x[a-fA-F0-9]{40}$/.test(owner ?? "") ? (owner as string) : undefined;
  // Anti-sybil quota (per human/owner): cap agents per creator.
  const MAX_AGENTS_PER_OWNER = Number(process.env.MAX_AGENTS_PER_OWNER ?? "3");
  if (ownerAddr && listAgents().filter((a) => a.owner?.toLowerCase() === ownerAddr.toLowerCase()).length >= MAX_AGENTS_PER_OWNER) {
    return NextResponse.json({ error: `agent quota reached (${MAX_AGENTS_PER_OWNER} per human)`, quota: true }, { status: 429 });
  }

  // 1. generate the agent's own wallet
  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);

  // 2. fund it from the faucet (0.6 USDC native = gas + stake)
  const faucet = privateKeyToAccount(process.env.ARC_FAUCET_PK as `0x${string}`);
  const pub = createPublicClient({ chain: arc, transport: http(ARC_RPC) });
  const faucetWallet = createWalletClient({ account: faucet, chain: arc, transport: http(ARC_RPC) });
  const fundTx = await faucetWallet.sendTransaction({ to: account.address, value: parseEther("0.6"), account: faucet, chain: arc });
  await pub.waitForTransactionReceipt({ hash: fundTx });

  // 3. mint the agent's ENS identity (reuse the mint route)
  let ens: string | undefined;
  try {
    const origin = new URL(req.url).origin;
    const m = await fetch(`${origin}/api/mint-subname`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: `${name}-bot`, userAddr: account.address }),
    }).then((r) => r.json());
    ens = m?.name;
  } catch { /* ENS optional */ }

  const agent: Agent = {
    id: account.address.slice(2, 10),
    name, ens, address: account.address, pk,
    preset, strategy: `${preset}: ${PRESETS[preset] ?? PRESETS["Contrarian"]}`,
    createdAt: Date.now(),
    owner: ownerAddr,
  };
  addAgent(agent);
  return NextResponse.json({ agent: publicAgent(agent), fundTx });
}
