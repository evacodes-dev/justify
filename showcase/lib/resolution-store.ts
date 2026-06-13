import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const FILE = join(process.cwd(), "resolutions.json");

export type Resolution = {
  id: number;
  verdict: "YES" | "NO";
  rationale: string;
  ethPrice: number;
  tx?: string;
  model: string;
  at: string;
};

export function getResolution(id: number): Resolution | null {
  try {
    const all: Resolution[] = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : [];
    return all.find((r) => r.id === id) ?? null;
  } catch { return null; }
}

export function saveResolution(r: Resolution) {
  let all: Resolution[] = [];
  try { all = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : []; } catch {}
  all = all.filter((x) => x.id !== r.id);
  all.push(r);
  writeFileSync(FILE, JSON.stringify(all, null, 2));
}
