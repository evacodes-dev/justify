import type { FastifyInstance } from "fastify";
import { randomUUID, createSign } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { config } from "../config.js";
import { isAddr } from "../util.js";

// Blink deposit signer: signs the widget payload with the merchant's ECDSA P-256 key
// (PEM stays server-side). On Base the deposit is native — no bridge leg.
export async function depositRoutes(app: FastifyInstance) {
  // Base USDC (Blink deposits land here). Used when the client sends token:"USDC".
  const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

  async function signBlink(body: any, reply: any) {
    const { amount, chainId, address, callbackScheme, version } = body ?? {};
    let token = body?.token;
    if (!(Number(amount) > 0)) return reply.code(400).send({ error: "amount" });
    if (!isAddr(address)) return reply.code(400).send({ error: "address" });
    if (!isAddr(token)) token = BASE_USDC; // accept "USDC" label
    if (!existsSync(config.blinkPemPath)) return reply.code(501).send({ error: "blink signer not configured" });

    const payloadObject = {
      amount, chainId: chainId ?? 8453, address, token,
      idempotencyKey: randomUUID(),
      callbackScheme: callbackScheme ?? null,
      signatureTimestamp: new Date().toISOString(),
      version: version || "v1",
    };
    const payload = Buffer.from(JSON.stringify(payloadObject), "utf8").toString("base64url");
    const signer = createSign("SHA256");
    signer.update(payload);
    signer.end();
    const signature = signer.sign(readFileSync(config.blinkPemPath, "utf8")).toString("base64url");
    return { merchantId: config.blinkMerchantId, payload, signature, preview: payloadObject };
  }

  app.post<{ Body: any }>("/deposit/blink/sign", async (req, reply) => signBlink(req.body, reply));
  // alias used by the SPA front-end
  app.post<{ Body: any }>("/api/sign-payment", async (req, reply) => signBlink(req.body, reply));
}
