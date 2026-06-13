import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// address → minted ENS name registry. Used to display a name when an embedded
// wallet has a forward addr record but no on-chain reverse/primary name set
// (it can't pay mainnet gas to set one).
const FILE = join(process.cwd(), "name-registry.json");

function load(): Record<string, string> {
  try { return existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {}; } catch { return {}; }
}
export function getName(address: string): string | null {
  return load()[address.toLowerCase()] ?? null;
}
export function setName(address: string, name: string) {
  const all = load();
  all[address.toLowerCase()] = name;
  writeFileSync(FILE, JSON.stringify(all, null, 2));
}
