import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { publicClient } from "./chain.js";

// EIP-191 session auth. The wallet signs ONE login message; we hand back an HMAC
// token (address + expiry). Every identity-asserting write then requires the token —
// the acting address comes from the token, never from the request body, so nobody
// can like/comment/post/edit-profile as somebody else's address.

// AUTH_SECRET should be set in prod; the random fallback just means tokens don't
// survive a restart (users transparently re-sign).
const SECRET = process.env.AUTH_SECRET || process.env.ADMIN_SECRET || randomBytes(32).toString("hex");
const TOKEN_TTL_MS = 30 * 86_400_000; // 30 days
const LOGIN_FRESHNESS_MS = 10 * 60_000;

export const loginMessage = (address: string, ts: number) =>
  `Justify sign-in\naddress: ${address.toLowerCase()}\nts: ${ts}`;

const mac = (payload: string) => createHmac("sha256", SECRET).update(payload).digest("base64url");

export function issueToken(address: string): string {
  const payload = Buffer.from(
    JSON.stringify({ a: address.toLowerCase(), exp: Date.now() + TOKEN_TTL_MS }),
  ).toString("base64url");
  return `${payload}.${mac(payload)}`;
}

export function verifyToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expect = Buffer.from(mac(payload));
  const got = Buffer.from(sig);
  if (got.length !== expect.length || !timingSafeEqual(got, expect)) return null;
  try {
    const { a, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof a !== "string" || Date.now() > Number(exp)) return null;
    return a;
  } catch {
    return null;
  }
}

/// Authenticated lowercase address for this request, or null after sending 401/403.
/// When the body also claims an address, it must match the token's.
export function requireAuth(req: FastifyRequest, reply: FastifyReply, claimed?: string): string | null {
  const addr = verifyToken(req.headers["x-auth-token"] as string | undefined);
  if (!addr) {
    reply.code(401).send({ error: "auth required — sign the login message first" });
    return null;
  }
  if (claimed && claimed.toLowerCase() !== addr) {
    reply.code(403).send({ error: "address mismatch" });
    return null;
  }
  return addr;
}

/// Verifies the EIP-191 login signature (ERC-1271 fallback for smart wallets via RPC).
export async function verifyLoginSignature(
  address: `0x${string}`,
  ts: number,
  signature: `0x${string}`,
): Promise<boolean> {
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > LOGIN_FRESHNESS_MS) return false;
  try {
    return await publicClient.verifyMessage({ address, message: loginMessage(address, ts), signature });
  } catch {
    return false;
  }
}
