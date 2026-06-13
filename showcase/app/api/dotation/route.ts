import { NextResponse } from "next/server";
import { createWalletClient, createPublicClient, defineChain, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Showcase — auto-dotation: send 0.5 USDC (native, = gas + asset on Arc) to a
// freshly-logged-in user's embedded wallet, from the faucet wallet. Server-only.
export const runtime = "nodejs";

const ARC_RPC = process.env.ARC_RPC ?? "https://rpc.testnet.arc.network";
const arc = defineChain({
  id: 5042002, name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] } },
});

const DOTATION = parseEther("0.5"); // 0.5 USDC (native 18-dec)
const granted = new Set<string>(); // demo: one dotation per address per server run

export async function POST(req: Request) {
  const { address } = await req.json();
  if (!/^0x[a-fA-F0-9]{40}$/.test(address ?? "")) {
    return NextResponse.json({ error: "bad address" }, { status: 400 });
  }
  const account = privateKeyToAccount(process.env.ARC_FAUCET_PK as `0x${string}`);
  const pub = createPublicClient({ chain: arc, transport: http(ARC_RPC) });

  // already funded enough? skip
  const bal = await pub.getBalance({ address });
  if (granted.has(address.toLowerCase()) || bal >= DOTATION) {
    return NextResponse.json({ skipped: true, balance: bal.toString() });
  }

  const wallet = createWalletClient({ account, chain: arc, transport: http(ARC_RPC) });
  const hash = await wallet.sendTransaction({ to: address, value: DOTATION, account, chain: arc });
  await pub.waitForTransactionReceipt({ hash });
  granted.add(address.toLowerCase());
  return NextResponse.json({ funded: true, hash, amount: "0.5" });
}
