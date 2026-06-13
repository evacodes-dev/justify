import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// File-backed set of World ID-verified wallet addresses (gate for commenting).
const FILE = join(process.cwd(), "verified-wallets.json");

function load(): string[] {
  try { return existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : []; } catch { return []; }
}
export function isVerified(address: string): boolean {
  return load().includes(address.toLowerCase());
}
export function addVerified(address: string) {
  const all = new Set(load());
  all.add(address.toLowerCase());
  writeFileSync(FILE, JSON.stringify([...all], null, 2));
}
