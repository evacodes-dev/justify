import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// File-backed agent registry. Each agent has its OWN generated wallet (pk stored
// server-side only — throwaway demo wallets) + ENS identity + strategy.
const FILE = join(process.cwd(), "agents.json");

export type Agent = {
  id: string;
  name: string;
  ens?: string;
  address: `0x${string}`;
  pk: `0x${string}`;
  strategy: string;
  preset: string;
  createdAt: number;
  owner?: string;        // creator's wallet (human) — for anti-sybil + approvals
  humanId?: string;      // anonymous World ID humanId (AgentKit lookupHuman) — proof-of-human
  agentBookTx?: string;  // AgentKit registration tx/ref
  erc8004Id?: string;    // ERC-8004 agentId on mainnet
};

export function listAgents(): Agent[] {
  try { return existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : []; } catch { return []; }
}
export function getAgent(id: string): Agent | null {
  return listAgents().find((a) => a.id === id) ?? null;
}
export function addAgent(a: Agent) {
  const all = listAgents();
  all.push(a);
  writeFileSync(FILE, JSON.stringify(all, null, 2));
}
export function updateAgent(id: string, patch: Partial<Agent>) {
  const all = listAgents();
  const i = all.findIndex((a) => a.id === id);
  if (i >= 0) { all[i] = { ...all[i], ...patch }; writeFileSync(FILE, JSON.stringify(all, null, 2)); }
}
// public view (no private key)
export function publicAgent(a: Agent) {
  const { pk, ...rest } = a;
  return rest;
}
