import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { mainnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { addEnsContracts } from "@ensdomains/ensjs";
import { setRecords } from "@ensdomains/ensjs/wallet";
import { getAgent, updateAgent } from "../../../../lib/agent-store";
import { registerAgent, agentRef, explorerTx, explorerToken } from "../../../../lib/erc8004";

// EXPLICIT action (not in any loop): register an existing agent on the ERC-8004
// Identity Registry (mainnet), then bind its ENS name → agentId via text records.
// One real on-chain tx (gas). Idempotent: if already registered, returns existing id.
export const runtime = "nodejs";

const RPC = process.env.MAINNET_RPC ?? "https://ethereum-rpc.publicnode.com";

export async function POST(req: Request) {
  const { agentId } = await req.json();
  const agent = getAgent(String(agentId ?? ""));
  if (!agent) return NextResponse.json({ error: "unknown agent" }, { status: 404 });
  if (agent.erc8004Id) {
    return NextResponse.json({ already: true, erc8004Id: agent.erc8004Id, token: explorerToken(agent.erc8004Id), ref: agentRef(agent.erc8004Id) });
  }

  const origin = process.env.PUBLIC_ORIGIN ?? new URL(req.url).origin;
  const agentURI = `${origin}/api/agent-card/${agent.address}`;

  // 1. on-chain register → agentId
  let reg;
  try {
    reg = await registerAgent({ agentURI });
  } catch (e: any) {
    return NextResponse.json({ error: "register failed: " + (e?.shortMessage || e?.message || String(e)) }, { status: 502 });
  }
  updateAgent(agent.id, { erc8004Id: reg.agentId });

  // 2. bind ENS name → agentId (ENSIP-26 text records). Best-effort: the identity
  //    is already on-chain; a failed text write shouldn't fail the whole action.
  let ensTx: string | undefined;
  if (agent.ens) {
    try {
      const account = privateKeyToAccount(process.env.ENS_OWNER_PK as `0x${string}`);
      const chain = addEnsContracts(mainnet);
      const pub = createPublicClient({ chain, transport: http(RPC) });
      const wallet = createWalletClient({ account, chain, transport: http(RPC) });
      const hash = await setRecords(wallet, {
        name: agent.ens,
        resolverAddress: chain.contracts.ensPublicResolver.address,
        texts: [
          { key: "registrations[0]", value: agentRef(reg.agentId) },
          { key: "com.justify.erc8004", value: reg.agentId },
        ],
      });
      await pub.waitForTransactionReceipt({ hash });
      ensTx = hash;
    } catch { /* ENS binding optional */ }
  }

  return NextResponse.json({
    erc8004Id: reg.agentId,
    chainId: reg.chainId,
    tx: reg.tx,
    txUrl: explorerTx(reg.tx),
    token: explorerToken(reg.agentId),
    ref: agentRef(reg.agentId),
    ensTx,
    agentURI,
  });
}
