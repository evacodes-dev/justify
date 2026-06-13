import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// File-backed store of user-created DemoMarkets (so they survive dev reloads).
const FILE = join(process.cwd(), "created-markets.json");

export type CreatedMarket = { id: number; address: string; question: string; creator: string };

export function listCreated(): CreatedMarket[] {
  try { return existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : []; }
  catch { return []; }
}

export function addCreated(m: Omit<CreatedMarket, "id">): CreatedMarket {
  const all = listCreated();
  const id = 100 + all.length; // user markets start at id 100
  const rec = { id, ...m };
  all.push(rec);
  writeFileSync(FILE, JSON.stringify(all, null, 2));
  return rec;
}
