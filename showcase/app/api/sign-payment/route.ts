import { randomUUID, createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Test 4 — Blink signer endpoint (signed-link model, ECDSA P-256 / SHA-256).
// Spec: https://docs.blink.cash/integration/signer-endpoint
// NOTE: real deposits require an operator-APPROVED merchantId. Until then the
// hosted flow rejects the signature (MERCHANT_NOT_REGISTERED) — but the modal
// still opens, which is the render-only PARTIAL we're validating.

export const runtime = "nodejs";

const MERCHANT_ID = process.env.BLINK_MERCHANT_ID || "UNREGISTERED-PLACEHOLDER";

function getPrivateKeyPem(): string {
  return readFileSync(join(process.cwd(), "blink-private.pem"), "utf8");
}

export async function POST(req: Request) {
  const body = await req.json();
  const { amount, chainId, address, token, callbackScheme, version } = body;

  // 1. Validate
  const errors: string[] = [];
  if (!Number.isFinite(amount) || amount <= 0) errors.push("amount must be > 0");
  if (!Number.isInteger(chainId) || chainId <= 0) errors.push("chainId must be a positive integer");
  if (typeof address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(address))
    errors.push("address must be a 0x 40-hex string");
  if (typeof token !== "string" || !/^0x[a-fA-F0-9]{1,40}$/.test(token))
    errors.push("token must be a 0x hex address");
  if (errors.length) return Response.json({ error: errors.join("; ") }, { status: 400 });

  // NOTE: production must also verify the authenticated user owns `address`.

  // 3/4. idempotency key + timestamp
  const idempotencyKey = randomUUID();
  const signatureTimestamp = new Date().toISOString();

  // 5. payload
  const payloadObject = {
    amount,
    chainId,
    address,
    token,
    idempotencyKey,
    callbackScheme: callbackScheme ?? null,
    signatureTimestamp,
    version: version || "v1",
  };

  // 6. base64url-encode the payload
  const payload = Buffer.from(JSON.stringify(payloadObject), "utf8").toString("base64url");

  // 7. sign the encoded payload string with ECDSA P-256 / SHA-256
  const signer = createSign("SHA256");
  signer.update(payload);
  signer.end();
  const signature = signer.sign(getPrivateKeyPem()).toString("base64url");

  // 8. respond
  return Response.json({
    merchantId: MERCHANT_ID,
    payload,
    signature,
    preview: { amount, chainId, address, token, idempotencyKey },
  });
}
