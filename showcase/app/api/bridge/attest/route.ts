import { NextResponse } from "next/server";
import { fetchAttestation } from "../../../../lib/cctp";

// Poll Circle Iris for the attestation of a burn tx. Returns quickly (one poll);
// the client polls this every few seconds until status === "complete".
// POST { txHash, sourceDomain }
export const runtime = "nodejs";

export async function POST(req: Request) {
  const { txHash, sourceDomain } = await req.json();
  if (!txHash || sourceDomain == null) return NextResponse.json({ error: "txHash + sourceDomain required" }, { status: 400 });
  const att = await fetchAttestation(Number(sourceDomain), String(txHash));
  return NextResponse.json(att);
}
