import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { db, kv } from "../store.js";

// Product social layer: likes + comments on markets + follower graph for creators, with an
// unfollow confirmation handled client-side. kv-backed (durable once Postgres is on).

type LikesMap = Record<string, string[]>; // marketId -> lowercase addresses
type FollowsMap = Record<string, string[]>; // target address (lower) -> follower addresses
type CommentRow = { id: string; address: string; text: string; ts: number };
type CommentsMap = Record<string, CommentRow[]>; // marketId -> chronological comments

export const likesOf = (marketId: number | string): string[] =>
  kv.get<LikesMap>("likes", {})[String(marketId)] ?? [];
export const followersOf = (addressLower: string): string[] =>
  kv.get<FollowsMap>("follows", {})[addressLower] ?? [];
export const commentsOf = (marketId: number | string): CommentRow[] =>
  kv.get<CommentsMap>("comments", {})[String(marketId)] ?? [];

const isAddr = (a?: string) => /^0x[a-fA-F0-9]{40}$/.test(a ?? "");

// resolve a user key (name or address) to their lowercase address
function resolveUser(key: string): string | undefined {
  const k = key.toLowerCase();
  const u = db.users.find((x) => x.name.toLowerCase() === k || x.address.toLowerCase() === k);
  return u?.address.toLowerCase() ?? (isAddr(key) ? k : undefined);
}

export async function socialRoutes(app: FastifyInstance) {
  // ── likes ──
  app.post<{ Body: any }>("/api/like", async (req, reply) => {
    const { address, marketId } = (req.body ?? {}) as { address?: string; marketId?: number | string };
    if (!isAddr(address)) return reply.code(400).send({ error: "address" });
    if (marketId == null || !db.markets.get(Number(marketId))) return reply.code(404).send({ error: "market" });
    const all = kv.get<LikesMap>("likes", {});
    const key = String(marketId);
    const cur = new Set(all[key] ?? []);
    const a = address!.toLowerCase();
    const liked = !cur.has(a);
    liked ? cur.add(a) : cur.delete(a);
    all[key] = [...cur];
    kv.set("likes", all);
    return { liked, count: cur.size };
  });

  app.get<{ Params: { marketId: string }; Querystring: { address?: string } }>(
    "/api/likes/:marketId",
    async (req) => {
      const list = likesOf(req.params.marketId);
      const a = String(req.query.address ?? "").toLowerCase();
      return { count: list.length, liked: !!a && list.includes(a) };
    },
  );

  // ── comments on markets ──
  app.post<{ Body: any }>("/api/comment", async (req, reply) => {
    const { address, marketId, text } = (req.body ?? {}) as { address?: string; marketId?: number | string; text?: string };
    if (!isAddr(address)) return reply.code(400).send({ error: "address" });
    if (marketId == null || !db.markets.get(Number(marketId))) return reply.code(404).send({ error: "market" });
    const t = String(text ?? "").trim();
    if (t.length < 1 || t.length > 500) return reply.code(400).send({ error: "text must be 1..500 chars" });
    const all = kv.get<CommentsMap>("comments", {});
    const key = String(marketId);
    const list = all[key] ?? [];
    const row: CommentRow = { id: randomUUID(), address: address!.toLowerCase(), text: t, ts: Date.now() };
    all[key] = [...list, row].slice(-300); // cap per market
    kv.set("comments", all);
    return { ok: true, count: all[key].length, comment: row };
  });

  app.get<{ Params: { marketId: string } }>("/api/comments/:marketId", async (req) => {
    const rows = commentsOf(req.params.marketId);
    const users = db.users.all();
    const byAddr = new Map(users.map((u) => [u.address.toLowerCase(), u]));
    return {
      comments: rows.map((c) => {
        const u = byAddr.get(c.address);
        return {
          id: c.id, address: c.address, text: c.text, ts: c.ts,
          name: u?.name ?? `${c.address.slice(0, 6)}…${c.address.slice(-4)}`,
          avatar: u?.avatar || "/img/images.jpeg", verified: !!u?.verified,
        };
      }),
    };
  });

  // ── follows (subscribe to creators) ──
  app.post<{ Body: any }>("/api/follow", async (req, reply) => {
    const { follower, target } = (req.body ?? {}) as { follower?: string; target?: string };
    if (!isAddr(follower)) return reply.code(400).send({ error: "follower" });
    const t = resolveUser(String(target ?? ""));
    if (!t) return reply.code(404).send({ error: "target not found" });
    if (t === follower!.toLowerCase()) return reply.code(400).send({ error: "cannot follow yourself" });
    const all = kv.get<FollowsMap>("follows", {});
    const cur = new Set(all[t] ?? []);
    const f = follower!.toLowerCase();
    const following = !cur.has(f);
    following ? cur.add(f) : cur.delete(f); // client shows the "are you sure?" modal before unfollow
    all[t] = [...cur];
    kv.set("follows", all);
    return { following, followers: cur.size };
  });

  app.get<{ Params: { key: string }; Querystring: { address?: string } }>("/api/follows/:key", async (req, reply) => {
    const t = resolveUser(req.params.key);
    if (!t) return reply.code(404).send({ error: "not found" });
    const list = followersOf(t);
    const a = String(req.query.address ?? "").toLowerCase();
    return { followers: list.length, following: !!a && list.includes(a) };
  });

  // list the creators a user follows (for a "Following" feed section)
  app.get<{ Params: { address: string } }>("/api/following/:address", async (req, reply) => {
    if (!isAddr(req.params.address)) return reply.code(400).send({ error: "address" });
    const me = req.params.address.toLowerCase();
    const all = kv.get<FollowsMap>("follows", {});
    const targets = Object.entries(all).filter(([, fs]) => fs.includes(me)).map(([t]) => t);
    const users = targets
      .map((t) => db.users.find((u) => u.address.toLowerCase() === t))
      .filter(Boolean)
      .map((u) => ({ name: u!.name, address: u!.address, avatar: u!.avatar || "/img/images.jpeg", verified: u!.verified }));
    return { following: users };
  });
}
