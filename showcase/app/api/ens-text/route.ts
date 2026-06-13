import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

// Live ENS reader (mainnet). GET /api/ens-text?name=vadym.jstfy-demo.eth&keys=avatar,com.justify.accuracy
export const runtime = "nodejs";

const RPC = process.env.MAINNET_RPC ?? "https://ethereum-rpc.publicnode.com";
const client = createPublicClient({ chain: mainnet, transport: http(RPC) });

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("name");
  if (!raw) return NextResponse.json({ error: "name required" }, { status: 400 });
  const keys = (searchParams.get("keys") ?? "description,avatar,com.justify.accuracy,com.justify.pnl").split(",");
  let name: string;
  try { name = normalize(raw); } catch { return NextResponse.json({ error: "bad name" }, { status: 400 }); }

  const [address, ...texts] = await Promise.all([
    client.getEnsAddress({ name }).catch(() => null),
    ...keys.map((k) => client.getEnsText({ name, key: k }).catch(() => null)),
  ]);
  const records: Record<string, string | null> = {};
  keys.forEach((k, i) => { records[k] = texts[i] as string | null; });
  return NextResponse.json({ name: raw, address, records });
}
