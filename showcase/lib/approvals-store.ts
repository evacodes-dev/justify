import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Pending large-bet approvals (human-in-the-loop). Owner approves via World ID.
const FILE = join(process.cwd(), "approvals.json");

export type Approval = {
  id: string;
  agentId: string;
  agent: string;          // ENS name
  owner: string;          // owner wallet (gate)
  marketId: number;
  marketQuestion: string;
  side: "YES" | "NO";
  amountUsdc: number;
  reasoning: string;
  ts: number;
  status: "pending" | "approved" | "rejected";
  tx?: string;
};

function load(): Approval[] { try { return existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : []; } catch { return []; } }
function save(a: Approval[]) { writeFileSync(FILE, JSON.stringify(a, null, 2)); }

export function listApprovals(owner?: string): Approval[] {
  const all = load();
  return owner ? all.filter((a) => a.owner.toLowerCase() === owner.toLowerCase()) : all;
}
export function getApproval(id: string): Approval | null { return load().find((a) => a.id === id) ?? null; }
export function addApproval(a: Approval) { const all = load(); all.unshift(a); save(all); }
export function updateApproval(id: string, patch: Partial<Approval>) {
  const all = load(); const i = all.findIndex((a) => a.id === id);
  if (i >= 0) { all[i] = { ...all[i], ...patch }; save(all); }
}
