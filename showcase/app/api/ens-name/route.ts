import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { getName } from "../../../lib/name-store";

// address → name: on-chain reverse (primary name) first, then the minted-name
// registry (for embedded wallets that have a forward addr record but no reverse).
export const runtime = "nodejs";
const RPC = process.env.MAINNET_RPC ?? "https://ethereum-rpc.publicnode.com";
const client = createPublicClient({ chain: mainnet, transport: http(RPC) });

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address");
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) return NextResponse.json({ name: null });
  let name = await client.getEnsName({ address: address as `0x${string}` }).catch(() => null);
  if (!name) name = getName(address); // registry fallback
  return NextResponse.json({ address, name });
}
