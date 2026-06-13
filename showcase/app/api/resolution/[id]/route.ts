import { NextResponse } from "next/server";
import { getResolution } from "../../../../lib/resolution-store";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = getResolution(Number(id));
  if (!r) return NextResponse.json({ error: "no resolution" }, { status: 404 });
  return NextResponse.json(r);
}
