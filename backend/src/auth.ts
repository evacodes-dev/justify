import type { FastifyReply, FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { config } from "./config.js";

// Auth = Dynamic session JWT. The user logs in once with Dynamic (email/social/wallet);
// Dynamic issues a signed JWT that proves which wallet they control. The SPA attaches it
// as `x-auth-token` on every identity write; here we verify it against Dynamic's public
// keys (JWKS) and read the wallet address out of it. No per-action message signing.

const envId = config.dynamicEnvId;
// Dynamic publishes rotating public keys here; createRemoteJWKSet caches + refreshes them.
const JWKS = envId
  ? createRemoteJWKSet(new URL(`https://app.dynamic.xyz/api/v0/sdk/${envId}/.well-known/jwks`))
  : null;

// Extract the primary blockchain wallet address from a verified Dynamic JWT payload.
function addressFromClaims(payload: any): string | null {
  const creds = Array.isArray(payload?.verified_credentials) ? payload.verified_credentials : [];
  const chain = creds.find((c: any) => (c?.format === "blockchain" || c?.chain) && typeof c?.address === "string");
  const addr = chain?.address ?? creds.find((c: any) => typeof c?.address === "string")?.address;
  return typeof addr === "string" && /^0x[a-fA-F0-9]{40}$/.test(addr) ? addr.toLowerCase() : null;
}

/// Verified lowercase wallet address from the Dynamic JWT, or null.
export async function verifyDynamicJwt(token: string | undefined): Promise<string | null> {
  if (!token || !JWKS) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS);
    return addressFromClaims(payload);
  } catch {
    return null;
  }
}

/// Authenticated lowercase address for this request, or null after sending 401/403.
/// When the body also claims an address, it must match the token's.
export async function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply,
  claimed?: string,
): Promise<string | null> {
  const addr = await verifyDynamicJwt(req.headers["x-auth-token"] as string | undefined);
  if (!addr) {
    reply.code(401).send({ error: "sign in to continue" });
    return null;
  }
  if (claimed && claimed.toLowerCase() !== addr) {
    reply.code(403).send({ error: "address mismatch" });
    return null;
  }
  return addr;
}
