import type { FastifyInstance } from "fastify";
import { CHAINS, waitAttestation, backendRelay, backendBurn, backendAddress, usdcBalance } from "../cctp-multi.js";

// Auto-bridge Base Sepolia → Arc via Circle CCTP. Blink deposits USDC to the backend
// on Base Sepolia; the backend then burns it to Arc and relays the mint to the user.
//   (Blink: ETH Sepolia → Base Sepolia)  +  (this: Base Sepolia → Arc, automatic)
// The backend pays Base Sepolia gas (needs Base Sepolia ETH).

type Job = {
  id: string; recipient: string; status: string; error?: string;
  amountUsdc?: string; txs: { burnBase?: string; mintArc?: string }; startedAt: number;
};
const jobs = new Map<string, Job>();

async function orchestrate(job: Job) {
  try {
    // 1) wait for the backend's Base Sepolia USDC to be funded by the Blink deposit
    job.status = "awaiting_funds";
    let amount = 0n;
    for (let i = 0; i < 60; i++) {
      amount = await usdcBalance(CHAINS.baseSepolia, backendAddress());
      if (amount > 0n) break;
      await new Promise((r) => setTimeout(r, 5000));
    }
    if (amount <= 0n) throw new Error("deposit not received on Base Sepolia (timeout)");
    job.amountUsdc = (Number(amount) / 1e6).toFixed(2);

    // 2) burn the received USDC on Base Sepolia → Arc (to the user)
    job.status = "bridging_burn";
    job.txs.burnBase = await backendBurn(CHAINS.baseSepolia, CHAINS.arc, amount, job.recipient);

    // 3) attestation + relay mint on Arc
    job.status = "bridging_attest";
    const att = await waitAttestation(CHAINS.baseSepolia.domain, job.txs.burnBase);
    job.status = "bridging_mint";
    job.txs.mintArc = await backendRelay(CHAINS.arc, att.message, att.attestation);

    job.status = "done";
  } catch (e) {
    job.status = "error";
    job.error = (e as Error).message;
  }
}

export async function depositBridgeRoutes(app: FastifyInstance) {
  // tell the client where to send the Blink deposit (the backend on Base Sepolia)
  app.get("/api/deposit/bridge-info", async () => ({
    backend: backendAddress(),
    baseSepolia: { chainId: CHAINS.baseSepolia.chainId, usdc: CHAINS.baseSepolia.usdc },
    arc: { chainId: CHAINS.arc.chainId },
  }));

  // start the auto Base→Arc bridge (call right after the Blink deposit completes)
  app.post<{ Body: any }>("/api/deposit/from-base", async (req, reply) => {
    const { recipient } = (req.body ?? {}) as any;
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipient ?? "")) return reply.code(400).send({ error: "bad recipient" });
    const id = Date.now().toString(36) + Math.floor(Math.abs(Math.sin(Date.now())) * 1e6).toString(36);
    const job: Job = { id, recipient, status: "queued", txs: {}, startedAt: Date.now() };
    jobs.set(id, job);
    orchestrate(job);
    return { id, status: job.status };
  });

  app.get<{ Params: { id: string } }>("/api/deposit/status/:id", async (req, reply) => {
    const job = jobs.get(req.params.id);
    if (!job) return reply.code(404).send({ error: "no job" });
    return job;
  });
}
