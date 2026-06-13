import type { FastifyInstance } from "fastify";
import { randomUUID, createSign } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { parseAbi } from "viem";
import { config } from "../config.js";
import { backendSigner, publicClient, arc } from "../chain.js";

// CCTP V2 testnet (Base Sepolia → Arc testnet). Env-overridable; defaults verified on-chain.
const CCTP = {
  iris: process.env.IRIS_URL ?? "https://iris-api-sandbox.circle.com",
  messageTransmitterV2: (process.env.ARC_MESSAGE_TRANSMITTER_V2 ??
    "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275") as `0x${string}`,
  baseDomain: 6,
};
const transmitterAbi = parseAbi(["function receiveMessage(bytes message, bytes attestation) returns (bool)"]);

export async function depositRoutes(app: FastifyInstance) {
  // ── Blink: sign a deposit payload (ECDSA P-256 / SHA-256 over the base64url string) ──
  app.post<{ Body: any }>("/deposit/blink/sign", async (req, reply) => {
    const { amount, chainId, address, token, callbackScheme, version } = (req.body ?? {}) as any;
    if (!(Number(amount) > 0)) return reply.code(400).send({ error: "amount" });
    if (!Number.isInteger(chainId) || chainId <= 0) return reply.code(400).send({ error: "chainId" });
    if (!/^0x[a-fA-F0-9]{40}$/.test(address ?? "")) return reply.code(400).send({ error: "address" });
    if (!/^0x[a-fA-F0-9]{1,40}$/.test(token ?? "")) return reply.code(400).send({ error: "token" });
    if (!existsSync(config.blinkPemPath)) return reply.code(501).send({ error: "blink signer not configured" });

    const payloadObject = {
      amount, chainId, address, token,
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
  });

  // ── CCTP bridge: poll Circle Iris for the attestation of a Base burn tx ──
  app.post<{ Body: any }>("/deposit/bridge/attest", async (req, reply) => {
    const { txHash, sourceDomain } = (req.body ?? {}) as any;
    if (!txHash) return reply.code(400).send({ error: "txHash" });
    const dom = sourceDomain ?? CCTP.baseDomain;
    const r = await fetch(`${CCTP.iris}/v2/messages/${dom}?transactionHash=${txHash}`, { headers: { accept: "application/json" } });
    if (r.status === 404) return { status: "pending" };
    if (!r.ok) return { status: `error_${r.status}` };
    const body: any = await r.json().catch(() => ({}));
    const m = body?.messages?.[0];
    if (!m) return { status: "pending" };
    return { status: m.status ?? "pending", message: m.message, attestation: m.attestation };
  });

  // ── CCTP bridge: relay receiveMessage on Arc → USDC minted to the recipient ──
  app.post<{ Body: any }>("/deposit/bridge/relay", async (req, reply) => {
    const { message, attestation } = (req.body ?? {}) as any;
    if (!message || !attestation) return reply.code(400).send({ error: "message + attestation required" });
    try {
      const tx = await backendSigner().run(({ wallet, account }) =>
        wallet.writeContract({ address: CCTP.messageTransmitterV2, abi: transmitterAbi, functionName: "receiveMessage", args: [message, attestation], account, chain: arc }),
      );
      await publicClient.waitForTransactionReceipt({ hash: tx as `0x${string}` });
      return { ok: true, tx, txUrl: `${config.explorer}/tx/${tx}` };
    } catch (e) {
      return reply.code(502).send({ error: "relay failed: " + (e as Error).message });
    }
  });
}
