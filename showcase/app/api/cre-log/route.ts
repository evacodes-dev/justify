import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";

// Serves the captured `cre workflow simulate` log (ETH/USD → DemoMarket #1).
export async function GET() {
  const p = join(process.cwd(), "cre-sim-log.txt");
  const log = existsSync(p) ? readFileSync(p, "utf8") : "No CRE simulation log captured yet.";
  return NextResponse.json({ log });
}
