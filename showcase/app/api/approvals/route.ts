import { NextResponse } from "next/server";
import { listApprovals } from "../../../lib/approvals-store";

// List human-in-the-loop approvals. Optional ?owner=0x... to scope to one human.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const owner = new URL(req.url).searchParams.get("owner") ?? undefined;
  return NextResponse.json({ approvals: listApprovals(owner || undefined) });
}
