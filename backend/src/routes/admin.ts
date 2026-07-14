import type { FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { db, kv } from "../store.js";
import { backendSigner, publicClient, arc } from "../chain.js";
import { registryAbi } from "../abis.js";
import type { CreatorRequest } from "./social.js";

// constant-time secret comparison (plain !== leaks timing)
const secretsMatch = (a: string, b: string) => {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

// Admin API: the ONLY way to grant the creator role (product decision — World ID verify is
// just a checkmark; creators are hand-picked). Protected by a shared secret header.
// Granting also registers the creator ON-CHAIN (backend = registry verifier) so the
// self-create mode (user signs registry.createMarket from their own wallet) works too.

export async function adminRoutes(app: FastifyInstance) {
  const guard = (req: any, reply: any): boolean => {
    if (!config.adminSecret) {
      reply.code(501).send({ error: "admin API disabled (ADMIN_SECRET not set)" });
      return false;
    }
    if (!secretsMatch(String(req.headers["x-admin-secret"] ?? ""), config.adminSecret)) {
      reply.code(401).send({ error: "unauthorized" });
      return false;
    }
    return true;
  };

  // grant / revoke the creator role
  app.post<{ Body: any }>("/api/admin/creator", async (req, reply) => {
    if (!guard(req, reply)) return;
    const { address, grant } = (req.body ?? {}) as { address?: string; grant?: boolean };
    if (!/^0x[a-fA-F0-9]{40}$/.test(address ?? "")) return reply.code(400).send({ error: "address" });
    const u = db.users.find((x) => x.address.toLowerCase() === address!.toLowerCase());
    if (!u) return reply.code(404).send({ error: "user not found (must verify with World ID first)" });
    db.users.patch(u.id, { creator: grant !== false });

    // close out any pending creator request from this address
    if (grant !== false) {
      const reqs = kv.get<CreatorRequest[]>("creatorRequests", []);
      let touched = false;
      for (const r of reqs) if (r.address === u.address.toLowerCase() && r.status === "pending") { r.status = "approved"; touched = true; }
      if (touched) kv.set("creatorRequests", reqs);
    }

    // best-effort on-chain registration for the self-create mode (no on-chain revoke exists;
    // the db flag remains the gate for the backend-create mode)
    let onchainTx: string | undefined;
    if (grant !== false && config.registry) {
      try {
        const already = (await publicClient.readContract({
          address: config.registry, abi: registryAbi, functionName: "isCreator", args: [u.address as `0x${string}`],
        })) as boolean;
        if (!already) {
          onchainTx = await backendSigner().run(({ wallet, account }) =>
            wallet.writeContract({ address: config.registry!, abi: registryAbi, functionName: "registerCreator", args: [u.address as `0x${string}`], account, chain: arc }),
          );
          await publicClient.waitForTransactionReceipt({ hash: onchainTx as `0x${string}` });
        }
      } catch (e) {
        app.log.error("on-chain registerCreator: " + (e as Error).message);
      }
    }
    return { ok: true, address: u.address, name: u.name, creator: grant !== false, onchainTx };
  });

  // list current creators
  app.get("/api/admin/creators", async (req, reply) => {
    if (!guard(req, reply)) return;
    return {
      creators: db.users
        .filter((u) => !!u.creator)
        .map((u) => ({ name: u.name, address: u.address, verified: u.verified })),
    };
  });

  // pending creator requests (submitted from /create) — grant via /api/admin/creator
  app.get("/api/admin/creator-requests", async (req, reply) => {
    if (!guard(req, reply)) return;
    const users = new Map(db.users.all().map((u) => [u.address.toLowerCase(), u]));
    return {
      requests: kv.get<CreatorRequest[]>("creatorRequests", [])
        .slice()
        .sort((a, b) => b.ts - a.ts)
        .map((r) => {
          const u = users.get(r.address);
          return { ...r, name: u?.name ?? null, verified: !!u?.verified };
        }),
    };
  });

  // dismiss a request without granting
  app.post<{ Body: any }>("/api/admin/creator-request", async (req, reply) => {
    if (!guard(req, reply)) return;
    const { id, action } = (req.body ?? {}) as { id?: string; action?: string };
    const reqs = kv.get<CreatorRequest[]>("creatorRequests", []);
    const r = reqs.find((x) => x.id === id);
    if (!r) return reply.code(404).send({ error: "request not found" });
    r.status = action === "dismiss" ? "dismissed" : r.status;
    kv.set("creatorRequests", reqs);
    return { ok: true, request: r };
  });
}
