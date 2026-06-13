import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { mainnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { addEnsContracts } from "@ensdomains/ensjs";
import { setRecords } from "@ensdomains/ensjs/wallet";
import { giveFeedback } from "../../../lib/erc8004";

// Write reputation: (a) ENS subname text records (one multicall tx) and, when an
// ERC-8004 agentId is supplied, (b) on-chain ERC-8004 feedback (separate client key).
// POST { name: "vadym.jstfy-demo.eth", accuracy: "87%", pnl: "+12.40", erc8004Id?, marketTag? }
export const runtime = "nodejs";

const RPC = process.env.MAINNET_RPC ?? "https://ethereum-rpc.publicnode.com";

export async function POST(req: Request) {
  const { name, accuracy, pnl, erc8004Id, marketTag } = await req.json();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const account = privateKeyToAccount(process.env.ENS_OWNER_PK as `0x${string}`);
  const chain = addEnsContracts(mainnet);
  const resolver = chain.contracts.ensPublicResolver.address;
  const pub = createPublicClient({ chain, transport: http(RPC) });
  const wallet = createWalletClient({ account, chain, transport: http(RPC) });

  const hash = await setRecords(wallet, {
    name,
    resolverAddress: resolver,
    texts: [
      { key: "com.justify.accuracy", value: String(accuracy ?? "—") },
      { key: "com.justify.pnl", value: String(pnl ?? "—") },
    ],
  });
  await pub.waitForTransactionReceipt({ hash });

  // ERC-8004 on-chain feedback (best-effort; needs a DISTINCT client key funded on-chain).
  let erc8004Tx: string | undefined, erc8004Err: string | undefined;
  if (erc8004Id) {
    const acc = parseFloat(String(accuracy ?? "").replace(/[^0-9.]/g, ""));
    if (Number.isFinite(acc)) {
      try {
        const { tx } = await giveFeedback({ agentId: String(erc8004Id), value: acc * 100, decimals: 2, tag1: "accuracy", tag2: String(marketTag ?? "") });
        erc8004Tx = tx;
      } catch (e: any) { erc8004Err = e?.shortMessage || e?.message || String(e); }
    }
  }
  return NextResponse.json({ name, tx: hash, accuracy, pnl, erc8004Tx, erc8004Err });
}
