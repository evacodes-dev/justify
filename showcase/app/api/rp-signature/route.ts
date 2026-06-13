import { NextResponse } from "next/server";
import { signRequest } from "@worldcoin/idkit-core/signing";

// Test 5 — World ID 4.0 RP signature. Backend-only; RP_SIGNING_KEY must never
// reach the client. Spec: https://docs.world.org/world-id/idkit/integrate (Step 3)
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const { action } = await request.json();

  const { sig, nonce, createdAt, expiresAt } = signRequest({
    signingKeyHex: process.env.RP_SIGNING_KEY!,
    action,
  });

  return NextResponse.json({
    sig,
    nonce,
    created_at: createdAt,
    expires_at: expiresAt,
  });
}
