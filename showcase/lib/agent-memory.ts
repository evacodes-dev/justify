import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Reflexion: per-agent memory of resolved-bet outcomes. After a market resolves we
// record win/loss; before the next decision we feed a short "lessons" summary back
// into the prompt so the agent learns from its own track record (calibration).
const FILE = join(process.cwd(), "agent-memory.json");

export type Outcome = {
  ts: number;
  marketId: number;
  marketQuestion: string;
  side: "YES" | "NO";
  estProb?: number;        // what the agent estimated at bet time
  verdict: "YES" | "NO";   // how the market actually resolved
  won: boolean;
};

type Mem = Record<string, Outcome[]>;
function load(): Mem { try { return existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {}; } catch { return {}; } }
function save(m: Mem) { writeFileSync(FILE, JSON.stringify(m, null, 2)); }

// Idempotent per (agentId, marketId) so re-resolving a market doesn't double-count.
export function recordOutcome(agentId: string, o: Outcome) {
  const m = load();
  const list = m[agentId] ?? [];
  if (list.some((x) => x.marketId === o.marketId)) return;
  list.unshift(o);
  m[agentId] = list.slice(0, 30);
  save(m);
}

export function getOutcomes(agentId: string): Outcome[] { return load()[agentId] ?? []; }

// Compact W/L for the UI badge.
export function recordStats(agentId: string): { w: number; l: number } {
  const all = getOutcomes(agentId);
  return { w: all.filter((o) => o.won).length, l: all.filter((o) => !o.won).length };
}

// A compact, prompt-ready track record + calibration nudge.
export function summarizeLessons(agentId: string): string {
  const all = getOutcomes(agentId);
  if (all.length === 0) return "";
  const wins = all.filter((o) => o.won).length;
  const recent = all.slice(0, 4).map((o) => {
    const est = o.estProb != null ? ` (you est ${(o.estProb * 100).toFixed(0)}% YES)` : "";
    return `- ${o.won ? "WON" : "LOST"} #${o.marketId} "${o.marketQuestion.slice(0, 48)}" — bet ${o.side}${est}, resolved ${o.verdict}`;
  }).join("\n");
  const rate = Math.round((wins / all.length) * 100);
  const nudge = rate < 50
    ? "You are below 50% — you have been MISCALIBRATED/overconfident. Pull your estimates toward the market-implied prob and demand a bigger edge before betting."
    : "Keep your edge discipline; don't get overconfident from a hot streak.";
  return `Your track record: ${wins}W/${all.length - wins}L (${rate}%).\n${recent}\n${nudge}`;
}
