import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { mainnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { addEnsContracts } from "@ensdomains/ensjs";
import { setPrimaryName } from "@ensdomains/ensjs/wallet";

// Set the owner wallet's primary ENS name (reverse record) so address→name resolves.
// POST { name: "vadym.jstfy-demo.eth" }  — signs with ENS_OWNER_PK (the named address).
export const runtime = "nodejs";
const RPC = process.env.MAINNET_RPC ?? "https://ethereum-rpc.publicnode.com";

export async function POST(req: Request) {
  const { name } = await req.json();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const account = privateKeyToAccount(process.env.ENS_OWNER_PK as `0x${string}`);
  const chain = addEnsContracts(mainnet);
  const pub = createPublicClient({ chain, transport: http(RPC) });
  const wallet = createWalletClient({ account, chain, transport: http(RPC) });
  const hash = await setPrimaryName(wallet, { name });
  await pub.waitForTransactionReceipt({ hash });
  return NextResponse.json({ name, address: account.address, tx: hash });
}
