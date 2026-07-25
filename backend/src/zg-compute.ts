import { createRequire } from "node:module";
import { ethers } from "ethers";
import type { ZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";
import { config } from "./config.js";

// The SDK's ESM bundle re-exports names its own chunk does not provide, which throws under
// tsx (how this server runs). The CommonJS build is intact, so load that one explicitly.
const require = createRequire(import.meta.url);
const { createZGComputeNetworkBroker } = require("@0gfoundation/0g-compute-ts-sdk") as {
  createZGComputeNetworkBroker: (signer: unknown) => Promise<ZGComputeNetworkBroker>;
};

// 0G Compute — inference routed through the 0G serving network.
//
// What this actually proves, as measured against the live network on 2026-07-25 (do not
// overstate it in the UI or the pitch):
//
//   • REAL: the request is billed on-chain. Every call carries a signed billing header and
//     settles from our ledger sub-account on 0G Chain, so "this verdict was produced through
//     0G Compute" is checkable by anyone from chain state, not taken on our word.
//   • REAL: the provider is registered on-chain with `verifiability: TeeML` and a TEE signer
//     address that 0G's contract owner has acknowledged — the network's own vetting that the
//     serving broker runs in an enclave (dstack).
//   • NOT AVAILABLE: a per-response enclave signature. Every text provider we probed on both
//     mainnet and Galileo reports `ProviderType: centralized` — the broker forwards to an
//     upstream API — and answers the signature endpoint with `chat_id_not_found` and the
//     attestation endpoint with 501. So `processResponse` cannot return true today.
//
// Hence `verified` stays null with the reason recorded, rather than being asserted. The
// justification bundle and the on-chain attestation carry that null through honestly: a claim
// we cannot back is worse than a gap we document. Correctness of the verdict is a separate
// matter entirely — that is what the challenge window on OptimisticSettler is for.

export type TeeAttestation = {
  provider: string;
  model: string;
  endpoint: string;
  chatId: string;
  /// On-chain verifiability class of the service (e.g. "TeeML").
  verifiability: string;
  /// TEE signer the 0G contract owner acknowledged for this provider.
  teeSignerAddress: string;
  teeSignerAcknowledged: boolean;
  /// true/false when the provider served a per-response signature; null when it exposes none.
  verified: boolean | null;
  /// Why `verified` is null — kept so the gap is legible instead of looking like an omission.
  verificationNote: string;
  verifiedAt: string;
};

export type ZgResult<T> = { value: T; tee: TeeAttestation; raw: string };

let brokerPromise: Promise<ZGComputeNetworkBroker> | null = null;

async function getBroker(): Promise<ZGComputeNetworkBroker> {
  if (brokerPromise === null) {
    brokerPromise = (async () => {
      if (!config.zg.pk) throw new Error("ZG_AGENT_PK not set");
      const provider = new ethers.JsonRpcProvider(config.zg.rpc);
      const wallet = new ethers.Wallet(config.zg.pk, provider);
      const broker = await createZGComputeNetworkBroker(wallet);
      await ensureLedger(broker);
      return broker;
    })().catch((e) => {
      brokerPromise = null; // let the next call retry a transient RPC/funding failure
      throw e;
    });
  }
  return brokerPromise;
}

/// The ledger is the prepaid account requests are billed against; it has to exist before the
/// first inference. Funding it needs testnet 0G on the agent wallet.
async function ensureLedger(broker: ZGComputeNetworkBroker): Promise<void> {
  try {
    await broker.ledger.getLedger();
  } catch {
    await broker.ledger.addLedger(config.zg.ledgerTopup);
  }
}

/// Ask the TEE-hosted model for a JSON answer and hand back the answer together with the
/// attestation that proves where it came from.
export async function zgJson<T>(opts: {
  system: string;
  user: string;
  schema: unknown;
  maxTokens?: number;
  provider?: string;
}): Promise<ZgResult<T>> {
  const broker = await getBroker();
  const providerAddress = opts.provider ?? config.zg.provider;

  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);

  // Open models have no forced tool-use, so the schema is carried in the prompt and the reply
  // is parsed defensively below. Naming the required keys inline matters: given only the
  // schema, models rename fields (a verdict came back under "answer" instead of "outcome").
  const required = requiredKeys(opts.schema);
  const system = `${opts.system}

Reply with a single JSON object and nothing else — no prose, no markdown fences.
It must match this JSON schema:
${JSON.stringify(opts.schema)}
${required.length ? `\nUse exactly these top-level keys, spelled as written: ${required.join(", ")}.` : ""}`;

  const content = `${system}\n\n---\n\n${opts.user}`;
  const headers = await broker.inference.getRequestHeaders(providerAddress, content);

  const res = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(headers as unknown as Record<string, string>),
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: opts.user },
      ],
      max_tokens: opts.maxTokens ?? 900,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    throw new Error(`0g inference failed: ${res.status} ${await res.text().catch(() => "")}`);
  }

  const body = (await res.json()) as {
    id?: string;
    model?: string;
    usage?: unknown;
    choices?: { message?: { content?: string } }[];
  };
  const raw = body.choices?.[0]?.message?.content ?? "";
  const chatId = body.id ?? "";
  if (!raw) throw new Error("0g inference returned an empty message");

  // Settle usage and ask for the response signature. `processResponse` bills from the usage
  // report — not the reply text — and returns the signature check when the provider serves one.
  let verified: boolean | null = null;
  let verificationNote = "";
  try {
    const usage = body.usage === undefined ? undefined : JSON.stringify(body.usage);
    verified = await broker.inference.processResponse(providerAddress, chatId, usage);
    if (verified === null) verificationNote = "provider returned no signature for this chat id";
  } catch (e) {
    verified = null;
    // Expected on every provider probed so far: they proxy to an upstream API and answer the
    // signature endpoint with chat_id_not_found. Recorded, not swallowed.
    verificationNote = `signature unavailable: ${(e as Error).message}`;
  }

  const service = await serviceInfo(broker, providerAddress);

  return {
    value: parseJson<T>(raw),
    raw,
    tee: {
      provider: providerAddress,
      model: body.model ?? model,
      endpoint,
      chatId,
      verifiability: service.verifiability,
      teeSignerAddress: service.teeSignerAddress,
      teeSignerAcknowledged: service.acknowledged,
      verified,
      verificationNote,
      verifiedAt: new Date().toISOString(),
    },
  };
}

/// On-chain facts about the provider: what the network vouches for even when the provider
/// serves no per-response signature.
async function serviceInfo(broker: ZGComputeNetworkBroker, providerAddress: string) {
  const fallback = { verifiability: "", teeSignerAddress: "", acknowledged: false };
  try {
    const services = await broker.inference.listService();
    const svc = services.find(
      (s: { provider: string }) => s.provider.toLowerCase() === providerAddress.toLowerCase(),
    ) as { verifiability?: string; teeSignerAddress?: string; teeSignerAcknowledged?: boolean } | undefined;
    if (!svc) return fallback;
    return {
      verifiability: String(svc.verifiability ?? ""),
      teeSignerAddress: String(svc.teeSignerAddress ?? ""),
      acknowledged: Boolean(svc.teeSignerAcknowledged),
    };
  } catch {
    return fallback;
  }
}

function requiredKeys(schema: unknown): string[] {
  const s = schema as { required?: unknown; properties?: Record<string, unknown> } | null;
  if (s === null || typeof s !== "object") return [];
  if (Array.isArray(s.required)) return s.required.map(String);
  return s.properties ? Object.keys(s.properties) : [];
}

/// Open models like to wrap JSON in prose or fences — recover the object rather than fail the
/// whole resolution over formatting.
function parseJson<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], raw, sliceOutermostObject(raw)];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate.trim()) as T;
    } catch {
      // try the next shape
    }
  }
  throw new Error(`0g inference returned unparseable JSON: ${raw.slice(0, 200)}`);
}

function sliceOutermostObject(raw: string): string | undefined {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return start !== -1 && end > start ? raw.slice(start, end + 1) : undefined;
}

/// Provider attestation: confirms the TEE signer and the image hash the provider is running.
export async function verifyProvider(providerAddress?: string) {
  const broker = await getBroker();
  return broker.inference.verifyService(providerAddress ?? config.zg.provider);
}

export async function listProviders() {
  const broker = await getBroker();
  return broker.inference.listServiceWithDetail();
}

export async function ledgerBalance() {
  const broker = await getBroker();
  return broker.ledger.getLedger();
}