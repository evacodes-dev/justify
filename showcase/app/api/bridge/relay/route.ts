import { NextResponse } from "next/server";
import { NET } from "../../../../lib/networks";
import { relayReceive } from "../../../../lib/cctp";

// Relay step: submit MessageTransmitterV2.receiveMessage on the DEST chain (Arc),
// minting the bridged USDC to the recipient encoded in the burn. receiveMessage is
// permissionless — anyone can relay — so the server pays Arc gas and the user needs
// no Arc gas. Relay key: ARC_FAUCET_PK (demo; KMS in prod).
// POST { message, attestation }
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { message, attestation } = await req.json();
  if (!message || !attestation) return NextResponse.json({ error: "message + attestation required" }, { status: 400 });
  const relayPk = process.env.ARC_FAUCET_PK as `0x${string}`;
  if (!relayPk) return NextResponse.json({ error: "no relay key configured" }, { status: 500 });
  try {
    const tx = await relayReceive(NET.arc, message, attestation, relayPk);
    return NextResponse.json({ tx, txUrl: `${NET.arc.explorer}/tx/${tx}` });
  } catch (e: any) {
    return NextResponse.json({ error: "relay failed: " + (e?.shortMessage || e?.message || String(e)) }, { status: 502 });
  }
}
