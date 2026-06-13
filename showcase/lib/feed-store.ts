import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const FILE = join(process.cwd(), "agent-feed.json");

export type FeedPost = {
  ts: number;
  agent: string;
  action: "bet" | "skip" | "request_approval";
  marketId?: number;
  marketQuestion?: string;
  side?: "YES" | "NO";
  amountUsdc?: number;
  confidence?: number;        // 0..1 from the LLM
  impliedProb?: number;       // market-implied YES prob (from pools)
  estProb?: number;           // agent's estimated YES prob
  edge?: number;              // |est - implied|
  reasoning: string;
  dataUsed?: { label: string; value: string; source: string }[];
  humanBacked?: boolean;      // proof-of-human (AgentKit) — filled later
  tx?: string;
  status?: "done" | "awaiting_approval";
};

export function listFeed(): FeedPost[] {
  try { return existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : []; } catch { return []; }
}
export function addFeed(p: FeedPost) {
  const all = listFeed();
  all.unshift(p);
  writeFileSync(FILE, JSON.stringify(all.slice(0, 50), null, 2));
}
