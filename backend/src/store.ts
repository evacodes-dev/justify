import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// File-backed JSON stores (hackathon shortcut; swap to Postgres later). Each "table"
// is one JSON file under backend/data/. Rows keyed by `id`.
const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

export class Table<T extends { id: string | number }> {
  private file: string;
  constructor(name: string) {
    this.file = join(dataDir, `${name}.json`);
  }
  all(): T[] {
    try {
      return existsSync(this.file) ? JSON.parse(readFileSync(this.file, "utf8")) : [];
    } catch {
      return [];
    }
  }
  private writeAll(rows: T[]) {
    writeFileSync(this.file, JSON.stringify(rows, null, 2));
  }
  get(id: T["id"]): T | undefined {
    return this.all().find((r) => r.id === id);
  }
  find(pred: (r: T) => boolean): T | undefined {
    return this.all().find(pred);
  }
  filter(pred: (r: T) => boolean): T[] {
    return this.all().filter(pred);
  }
  put(row: T): T {
    const rows = this.all();
    const i = rows.findIndex((r) => r.id === row.id);
    if (i >= 0) rows[i] = row;
    else rows.push(row);
    this.writeAll(rows);
    return row;
  }
  patch(id: T["id"], partial: Partial<T>): T | undefined {
    const rows = this.all();
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) return undefined;
    rows[i] = { ...rows[i], ...partial };
    this.writeAll(rows);
    return rows[i];
  }
  prepend(row: T) {
    const rows = this.all();
    rows.unshift(row);
    this.writeAll(rows.slice(0, 500));
  }
}

// Simple key/value (cursor, counters)
const kvFile = join(dataDir, "_kv.json");
export const kv = {
  get<T = any>(k: string, dflt: T): T {
    try {
      const o = existsSync(kvFile) ? JSON.parse(readFileSync(kvFile, "utf8")) : {};
      return k in o ? o[k] : dflt;
    } catch {
      return dflt;
    }
  },
  set(k: string, v: any) {
    const o = existsSync(kvFile) ? JSON.parse(readFileSync(kvFile, "utf8")) : {};
    o[k] = v;
    writeFileSync(kvFile, JSON.stringify(o, null, 2));
  },
};

// ─── domain row types ───
export type User = { id: string; address: string; name: string; verified: boolean; humanId?: string; avatar?: string; createdAt: number; arcTx?: string };
export type Market = { id: number; address: string; question: string; metadataURI: string; collateral: string; creator: string; closeTime: number; createdAt: number; priceYes: number; volume: number; resolved: boolean; outcome?: number; reason?: string };
export type Trade = { id: string; marketId: number; user: string; outcome: number; amountUsdc: number; shares: number; priceYesAfter: number; tx: string; ts: number; agent?: boolean };
export type Position = { id: string; marketId: number; user: string; yes: number; no: number };
export type FeedItem = { id: string; ts: number; kind: "trade" | "agent" | "resolution"; agent?: boolean; agentName?: string; user?: string; marketId?: number; marketQuestion?: string; outcome?: number; amountUsdc?: number; reasoning?: string; confidence?: number; estProb?: number; impliedProb?: number; edge?: number; dataUsed?: string[]; humanBacked?: boolean; tx?: string; status?: string };
export type AgentRow = { id: string; name: string; ownerHumanId: string; ownerAddress: string; address: string; pk: string; strategy: string; preset: string; budgetUsdc: number; spentUsdc: number; active: boolean; humanBacked: boolean; agentBookTx?: string; createdAt: number; wins: number; losses: number };
export type Reputation = { id: string; subject: string; accuracy: number; pnl: number; markets: number; isAgent: boolean };
export type Approval = { id: string; agentId: string; agentName: string; ownerAddress: string; marketId: number; marketQuestion: string; outcome: number; amountUsdc: number; reasoning: string; ts: number; status: "pending" | "approved" | "rejected"; tx?: string };

export const db = {
  users: new Table<User>("users"),
  markets: new Table<Market>("markets"),
  trades: new Table<Trade>("trades"),
  positions: new Table<Position>("positions"),
  feed: new Table<FeedItem>("feed"),
  agents: new Table<AgentRow>("agents"),
  reputation: new Table<Reputation>("reputation"),
  approvals: new Table<Approval>("approvals"),
};

// nullifier dedup (World ID anti-replay)
export const nullifiers = {
  has: (n: string) => kv.get<string[]>("nullifiers", []).includes(n),
  add: (n: string) => kv.set("nullifiers", [...new Set([...kv.get<string[]>("nullifiers", []), n])]),
};
