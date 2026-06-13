import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, namehash } from "viem";
import { mainnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { addEnsContracts } from "@ensdomains/ensjs";
import { createSubname, setRecords } from "@ensdomains/ensjs/wallet";
import { setName } from "../../../lib/name-store";

// Showcase — live ENS subname mint under jstfy-demo.eth (mainnet, registry path).
// Server-only (owner key). ≤5 mints per server run (spec limit). Subname owner =
// server wallet so it can mint bot.* and write reputation; addr(60) = the user.
export const runtime = "nodejs";

const RPC = process.env.MAINNET_RPC!;
const PARENT = process.env.DEMO_PARENT ?? "jstfy-demo.eth";
const REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const NAME_WRAPPER = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";

const MINT_CAP = 5;
const minted = new Set<string>(); // labels minted this server run

// GET /api/mint-subname?label=alice[&sub=vadym] → { name, available }
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const label = String(searchParams.get("label") ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20);
  const sub = searchParams.get("sub");
  if (!label) return NextResponse.json({ available: false, label: "" });
  const name = sub ? `${label}.${sub}.${PARENT}` : `${label}.${PARENT}`;
  const pub = createPublicClient({ chain: addEnsContracts(mainnet), transport: http(RPC) });
  const resolver = (await pub.readContract({
    address: REGISTRY, abi: [{ name: "resolver", type: "function", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "address" }] }],
    functionName: "resolver", args: [namehash(name) as `0x${string}`],
  })) as string;
  const taken = !!resolver && resolver !== "0x0000000000000000000000000000000000000000";
  return NextResponse.json({ name, label, available: !taken });
}

export async function POST(req: Request) {
  const { label: rawLabel, userAddr, sub } = await req.json();
  const label = String(rawLabel ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20);
  if (!label) return NextResponse.json({ error: "bad label" }, { status: 400 });
  if (!/^0x[a-fA-F0-9]{40}$/.test(userAddr ?? "")) return NextResponse.json({ error: "bad userAddr" }, { status: 400 });

  // full name: label.jstfy-demo.eth, or bot.<parentLabel>.jstfy-demo.eth for agents
  const name = sub ? `${label}.${sub}.${PARENT}` : `${label}.${PARENT}`;

  const account = privateKeyToAccount(process.env.ENS_OWNER_PK as `0x${string}`);
  const chain = addEnsContracts(mainnet);
  const resolver = chain.contracts.ensPublicResolver.address;
  const pub = createPublicClient({ chain, transport: http(RPC) });
  const wallet = createWalletClient({ account, chain, transport: http(RPC) });

  // idempotency: if already has a resolver set, treat as existing
  const node = namehash(name) as `0x${string}`;
  const existing = (await pub.readContract({
    address: REGISTRY, abi: [{ name: "resolver", type: "function", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "address" }] }],
    functionName: "resolver", args: [node],
  })) as string;
  if (existing && existing !== "0x0000000000000000000000000000000000000000") {
    setName(userAddr, name);
    return NextResponse.json({ name, existing: true });
  }

  if (minted.size >= MINT_CAP) {
    return NextResponse.json({ error: `mint cap reached (${MINT_CAP}) for this demo run` }, { status: 429 });
  }

  // detect wrap state of the immediate parent
  const parentName = sub ? `${sub}.${PARENT}` : PARENT;
  const parentNode = namehash(parentName) as `0x${string}`;
  const parentOwner = (await pub.readContract({
    address: REGISTRY, abi: [{ name: "owner", type: "function", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "address" }] }],
    functionName: "owner", args: [parentNode],
  })) as string;
  const contract = (parentOwner.toLowerCase() === NAME_WRAPPER.toLowerCase() ? "nameWrapper" : "registry") as "nameWrapper" | "registry";

  const h1 = await createSubname(wallet, { name, owner: account.address, contract, resolverAddress: resolver });
  await pub.waitForTransactionReceipt({ hash: h1 });
  const h2 = await setRecords(wallet, {
    name, resolverAddress: resolver,
    texts: [{ key: "description", value: `${label} on Justify` }, { key: "avatar", value: "https://euc.li/justify.png" }],
    coins: [{ coin: "eth", value: userAddr }],
  });
  await pub.waitForTransactionReceipt({ hash: h2 });
  minted.add(name);
  setName(userAddr, name);

  return NextResponse.json({ name, createTx: h1, recordsTx: h2, minted: minted.size, cap: MINT_CAP });
}
