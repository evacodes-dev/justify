import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

// Runs `cre workflow simulate` live (ETH/USD → DemoMarket #1) and returns the log.
// Best-effort: needs cre login creds (~/.cre) + bun on PATH; falls back gracefully.
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
  const local = process.env.LOCALAPPDATA ?? join(home, "AppData", "Local");
  const cre = join(local, "Programs", "cre", "cre.exe");
  const cwd = join(home, "hack-sandbox", "cre", "prediction-market");
  const bunDir = join(home, "AppData", "Roaming", "npm", "node_modules", "bun", "bin");

  const out: string[] = [];
  const code: number = await new Promise((resolve) => {
    let done = false;
    const child = spawn(cre, ["workflow", "simulate", "market-resolution", "--target", "staging-settings", "--non-interactive", "--trigger-index", "0"], {
      cwd, env: { ...process.env, PATH: `${bunDir};${process.env.PATH ?? ""}` },
    });
    const onData = (d: Buffer) => out.push(d.toString());
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    const timer = setTimeout(() => { if (!done) { done = true; try { child.kill(); } catch {} resolve(-2); } }, 100000);
    child.on("error", () => { if (!done) { done = true; clearTimeout(timer); resolve(-1); } });
    child.on("close", (c) => { if (!done) { done = true; clearTimeout(timer); resolve(c ?? 0); } });
  });

  const raw = out.join("");
  const lines = raw.split(/\r?\n/).filter((l) => /USER LOG|Simulation Result|compiled|Resolved|ETH\/USD|DemoMarket|error|fail/i.test(l));
  const log = lines.length ? lines.join("\n") : raw.slice(-1500) || "CRE run produced no output.";

  if (code === 0 || lines.length) {
    try { writeFileSync(join(process.cwd(), "cre-sim-log.txt"), log); } catch {}
  }
  return NextResponse.json({ ok: code === 0 || lines.length > 0, code, log });
}
