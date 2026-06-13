import { NextResponse } from "next/server";
import type { IDKitResult } from "@worldcoin/idkit";
import { addVerified } from "../../../lib/verified-store";

// Test 5 / Showcase — World ID 4.0 proof verification.
// Forwards the IDKit payload to the Developer Portal, records nullifier first-use.
// DEMO note: production should REJECT nullifier reuse (sybil). Here, to keep the
// showcase re-runnable, a reused nullifier is reported as "alreadyVerified" (still
// a real human) and the wallet is marked verified so onboarding can continue.
export const runtime = "nodejs";

const seenNullifiers = new Set<string>();
const verifiedWallets = new Set<string>(); // wallet addresses that completed World ID

// GET /api/verify-proof?address=0x... → { verified }
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const addr = (searchParams.get("address") ?? "").toLowerCase();
  return NextResponse.json({ verified: addr ? verifiedWallets.has(addr) : false });
}

export async function POST(request: Request) {
  const { rp_id, idkitResponse, walletAddress } = (await request.json()) as {
    rp_id: string;
    idkitResponse: IDKitResult;
    walletAddress?: string;
  };
  const wallet = (walletAddress ?? "").toLowerCase();

  const portal = await fetch(`https://developer.world.org/api/v4/verify/${rp_id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(idkitResponse),
  });
  const portalBody = await portal.json().catch(() => ({}));
  if (!portal.ok) {
    return NextResponse.json({ error: "Verification failed", portal: portalBody }, { status: 400 });
  }

  const nullifiers = (idkitResponse?.responses ?? [])
    .map((r: { nullifier?: string }) => r?.nullifier)
    .filter(Boolean) as string[];

  const reused = nullifiers.some((n) => seenNullifiers.has(n));
  nullifiers.forEach((n) => seenNullifiers.add(n));
  if (wallet) { verifiedWallets.add(wallet); addVerified(wallet); }

  // Demo-friendly: reuse is still a valid human → 200 with a flag (prod would 409).
  return NextResponse.json({ success: true, alreadyVerified: reused, nullifiers });
}
