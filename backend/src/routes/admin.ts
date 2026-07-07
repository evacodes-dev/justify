import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { db } from "../store.js";

// Admin API: the ONLY way to grant the creator role (product decision — World ID verify is
// just a checkmark; creators are hand-picked). Protected by a shared secret header.
// Note: no on-chain registration needed — the backend itself is the on-chain registered
// creator and deploys markets on users' behalf; `creator` is an API-level role.

export async function adminRoutes(app: FastifyInstance) {
  const guard = (req: any, reply: any): boolean => {
    if (!config.adminSecret) {
      reply.code(501).send({ error: "admin API disabled (ADMIN_SECRET not set)" });
      return false;
    }
    if (req.headers["x-admin-secret"] !== config.adminSecret) {
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
    return { ok: true, address: u.address, name: u.name, creator: grant !== false };
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
}
