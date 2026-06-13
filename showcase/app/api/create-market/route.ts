import { NextResponse } from "next/server";
import { createWalletClient, createPublicClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DEMO_MARKET_BYTECODE } from "../../../lib/demomarket-artifact";
import { addCreated, listCreated } from "../../../lib/market-store";

// Showcase — deploy a NEW DemoMarket on Arc (owner = faucet wallet) with the
// user's question. Real on-chain contract creation. Server-only.
export const runtime = "nodejs";

const ARC_RPC = process.env.ARC_RPC ?? "https://rpc.testnet.arc.network";
const USDC = "0x3600000000000000000000000000000000000000" as `0x${string}`;
const arc = defineChain({
  id: 5042002, name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
});

const DEPLOY_ABI = [
  { type: "constructor", stateMutability: "nonpayable", inputs: [{ type: "address", name: "_usdc" }, { type: "string", name: "_question" }] },
] as const;

const CREATE_CAP = 10;

export async function GET() {
  return NextResponse.json({ created: listCreated() });
}

export async function POST(req: Request) {
  const { question, creator } = await req.json();
  const q = String(question ?? "").trim().slice(0, 140);
  if (q.length < 8) return NextResponse.json({ error: "question too short (min 8 chars)" }, { status: 400 });
  if (listCreated().length >= CREATE_CAP) return NextResponse.json({ error: `create cap reached (${CREATE_CAP})` }, { status: 429 });

  const account = privateKeyToAccount(process.env.ARC_FAUCET_PK as `0x${string}`);
  const pub = createPublicClient({ chain: arc, transport: http(ARC_RPC) });
  const wallet = createWalletClient({ account, chain: arc, transport: http(ARC_RPC) });

  const hash = await wallet.deployContract({
    abi: DEPLOY_ABI, bytecode: DEMO_MARKET_BYTECODE, args: [USDC, q], account, chain: arc,
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  const address = receipt.contractAddress!;
  const rec = addCreated({ address, question: q, creator: creator ?? "anon" });

  return NextResponse.json({ ...rec, deployTx: hash, explorer: `https://testnet.arcscan.app/address/${address}` });
}
