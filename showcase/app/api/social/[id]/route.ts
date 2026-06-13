import { NextResponse } from "next/server";
import { getSocial, toggleLike, addComment } from "../../../../lib/social-store";
import { isVerified } from "../../../../lib/verified-store";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const viewer = new URL(req.url).searchParams.get("viewer") ?? undefined;
  return NextResponse.json(getSocial(id, viewer));
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  const address = String(body.address ?? "");
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return NextResponse.json({ error: "log in first" }, { status: 401 });

  if (body.type === "like") {
    return NextResponse.json(toggleLike(id, address));
  }
  if (body.type === "comment") {
    // World ID gate — only a verified human can comment
    if (!isVerified(address)) return NextResponse.json({ error: "verify with World ID to comment", needsWorldId: true }, { status: 403 });
    const text = String(body.text ?? "").trim().slice(0, 280);
    if (text.length < 1) return NextResponse.json({ error: "empty comment" }, { status: 400 });
    const comments = addComment(id, { author: address, ens: body.ens, text, ts: Date.now() });
    return NextResponse.json({ comments });
  }
  return NextResponse.json({ error: "bad type" }, { status: 400 });
}
