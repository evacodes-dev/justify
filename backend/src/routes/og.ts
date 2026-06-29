import type { FastifyInstance } from "fastify";
import { db } from "../store.js";

// BE9 — OG share images. Renders a 1200×630 social card per market (question + live
// YES/NO odds + volume + branding) as SVG. Dependency-free so it ships now; a PNG
// rasterizer (@resvg/resvg-js or satori) can wrap this later for platforms that don't
// render SVG og:image (Twitter). Cards drive the share-to-grow loop.
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// naive word-wrap for the question (SVG has no auto-wrap)
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) {
      lines.push(cur.trim());
      cur = w;
      if (lines.length === maxLines - 1) break;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur.trim());
  const used = lines.join(" ").split(/\s+/).length;
  if (used < words.length && lines.length) lines[lines.length - 1] += "…";
  return lines;
}

export async function ogRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/api/og/:id", async (req, reply) => {
    const id = Number(String(req.params.id).replace(/\.svg$/, ""));
    const m = db.markets.get(id);
    if (!m) return reply.code(404).send({ error: "not found" });

    const yes = Math.round((m.priceYes ?? 0.5) * 100);
    const no = 100 - yes;
    const vol = `$${(m.volume ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    const status = m.resolved
      ? m.outcome === 1 ? "RESOLVED · YES" : m.outcome === 0 ? "RESOLVED · NO" : "RESOLVED · INVALID"
      : "LIVE";
    const lines = wrap(m.question, 34, 3);
    const qText = lines
      .map((ln, i) => `<text x="80" y="${markupY(i)}" class="q">${esc(ln)}</text>`)
      .join("");

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d1117"/><stop offset="1" stop-color="#161b22"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <text x="80" y="96" fill="#7c8aff" font-family="Segoe UI, sans-serif" font-size="34" font-weight="700">justify.market</text>
  <text x="1120" y="96" text-anchor="end" fill="${m.resolved ? "#3fb950" : "#f0a500"}" font-family="Segoe UI, sans-serif" font-size="26" font-weight="700">${esc(status)}</text>
  <style>.q{fill:#ffffff;font-family:Segoe UI,sans-serif;font-size:60px;font-weight:800}</style>
  ${qText}
  <g font-family="Segoe UI, sans-serif">
    <rect x="80" y="430" width="480" height="120" rx="18" fill="#10331f" stroke="#1f7a44"/>
    <text x="110" y="485" fill="#9be7b4" font-size="28">YES</text>
    <text x="110" y="535" fill="#3fb950" font-size="54" font-weight="800">${yes}¢</text>
    <rect x="600" y="430" width="480" height="120" rx="18" fill="#3a1518" stroke="#a3343a"/>
    <text x="630" y="485" fill="#f0a8ab" font-size="28">NO</text>
    <text x="630" y="535" fill="#e5484d" font-size="54" font-weight="800">${no}¢</text>
  </g>
  <text x="80" y="600" fill="#8b949e" font-family="Segoe UI, sans-serif" font-size="26">${esc(vol)} Vol · prediction market on Base</text>
</svg>`;

    reply
      .header("content-type", "image/svg+xml; charset=utf-8")
      .header("cache-control", "public, max-age=300")
      .send(svg);
  });
}

// y position for each wrapped question line
function markupY(i: number): number {
  return 200 + i * 78;
}
