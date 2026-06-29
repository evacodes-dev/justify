import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { kv } from "../store.js";

// BE13 — closed-beta infra: bug reports earn points. Lightweight kv-backed ledger
// (durable once Postgres is wired via BE12). Points seed an early-tester reward program.
const POINTS_PER_BUG = Number(process.env.POINTS_PER_BUG ?? 50);

type BugReport = { id: string; ts: number; address: string; message: string; page?: string; status: "open" | "closed" };

export async function betaRoutes(app: FastifyInstance) {
  app.post<{ Body: any }>("/api/bug-report", async (req, reply) => {
    const { address, message, page } = (req.body ?? {}) as { address?: string; message?: string; page?: string };
    const msg = String(message ?? "").trim();
    if (msg.length < 5) return reply.code(400).send({ error: "message too short" });
    const addr = /^0x[a-fA-F0-9]{40}$/.test(address ?? "") ? (address as string) : "anon";

    const reports = kv.get<BugReport[]>("bugReports", []);
    const report: BugReport = { id: randomUUID(), ts: Date.now(), address: addr, message: msg.slice(0, 2000), page, status: "open" };
    reports.push(report);
    kv.set("bugReports", reports.slice(-2000));

    // award points (only to identified wallets)
    let points = 0;
    if (addr !== "anon") {
      const ledger = kv.get<Record<string, number>>("points", {});
      ledger[addr.toLowerCase()] = (ledger[addr.toLowerCase()] ?? 0) + POINTS_PER_BUG;
      kv.set("points", ledger);
      points = ledger[addr.toLowerCase()];
    }
    return { ok: true, id: report.id, awarded: addr !== "anon" ? POINTS_PER_BUG : 0, points };
  });

  app.get<{ Params: { address: string } }>("/api/points/:address", async (req) => {
    const addr = String(req.params.address).toLowerCase();
    const ledger = kv.get<Record<string, number>>("points", {});
    return { address: req.params.address, points: ledger[addr] ?? 0 };
  });
}
