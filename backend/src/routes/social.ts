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

type PostRow = { id: string; address: string; text: string; ts: number };
type PostLikesMap = Record<string, string[]>; // postId -> lowercase addresses
type PostCommentsMap = Record<string, CommentRow[]>; // postId -> chronological comments

export const postLikesOf = (postId: string): string[] =>
  kv.get<PostLikesMap>("postLikes", {})[postId] ?? [];
export const postCommentsOf = (postId: string): CommentRow[] =>
  kv.get<PostCommentsMap>("postComments", {})[postId] ?? [];

const userByAddr = () => new Map(db.users.all().map((u) => [u.address.toLowerCase(), u]));
const enrich = (rows: { address: string }[] | PostRow[] | CommentRow[]) => {
  const users = userByAddr();
  return (rows as any[]).map((r) => {
    const u = users.get(r.address);
    return {
      ...r,
      name: u?.name ?? `${r.address.slice(0, 6)}…${r.address.slice(-4)}`,
      avatar: u?.avatar || "/img/images.jpeg",
      verified: !!u?.verified,
    };
  });
};

/// last N comments of a market, enriched — for feed-card previews
export const recentCommentsOf = (marketId: number | string, n = 3) =>
  enrich(commentsOf(marketId).slice(-n));

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

  // ── text posts ("vogels" — post your crypto ideas) ──
  app.post<{ Body: any }>("/api/post", async (req, reply) => {
    const { address, text } = (req.body ?? {}) as { address?: string; text?: string };
    if (!isAddr(address)) return reply.code(400).send({ error: "address" });
    const t = String(text ?? "").trim();
    if (t.length < 1 || t.length > 500) return reply.code(400).send({ error: "text must be 1..500 chars" });
    const posts = kv.get<PostRow[]>("posts", []);
    const row: PostRow = { id: randomUUID(), address: address!.toLowerCase(), text: t, ts: Date.now() };
    kv.set("posts", [...posts, row].slice(-500));
    return { ok: true, post: enrich([row])[0] };
  });

  app.get<{ Querystring: { author?: string; limit?: string; viewer?: string } }>("/api/posts", async (req) => {
    let rows = kv.get<PostRow[]>("posts", []);
    const author = String(req.query.author ?? "").toLowerCase();
    if (author) {
      const u = db.users.find((x) => x.name.toLowerCase() === author || x.address.toLowerCase() === author);
      const addr = u?.address.toLowerCase() ?? author;
      rows = rows.filter((p) => p.address === addr);
    }
    const limit = Math.min(100, Number(req.query.limit) || 30);
    const viewer = String(req.query.viewer ?? "").toLowerCase();
    const posts = enrich(rows.slice(-limit).reverse()).map((p: any) => {
      const likes = postLikesOf(p.id);
      return {
        ...p,
        likes: likes.length,
        liked: !!viewer && likes.includes(viewer),
        comments: postCommentsOf(p.id).length,
        recentComments: enrich(postCommentsOf(p.id).slice(-2)),
      };
    });
    return { posts };
  });

  // ── likes + comments on text posts ──
  app.post<{ Body: any }>("/api/post-like", async (req, reply) => {
    const { address, postId } = (req.body ?? {}) as { address?: string; postId?: string };
    if (!isAddr(address)) return reply.code(400).send({ error: "address" });
    const id = String(postId ?? "");
    if (!kv.get<PostRow[]>("posts", []).some((p) => p.id === id)) return reply.code(404).send({ error: "post" });
    const all = kv.get<PostLikesMap>("postLikes", {});
    const cur = new Set(all[id] ?? []);
    const a = address!.toLowerCase();
    const liked = !cur.has(a);
    liked ? cur.add(a) : cur.delete(a);
    all[id] = [...cur];
    kv.set("postLikes", all);
    return { liked, count: cur.size };
  });

  app.post<{ Body: any }>("/api/post-comment", async (req, reply) => {
    const { address, postId, text } = (req.body ?? {}) as { address?: string; postId?: string; text?: string };
    if (!isAddr(address)) return reply.code(400).send({ error: "address" });
    const id = String(postId ?? "");
    if (!kv.get<PostRow[]>("posts", []).some((p) => p.id === id)) return reply.code(404).send({ error: "post" });
    const t = String(text ?? "").trim();
    if (t.length < 1 || t.length > 500) return reply.code(400).send({ error: "text must be 1..500 chars" });
    const all = kv.get<PostCommentsMap>("postComments", {});
    const row: CommentRow = { id: randomUUID(), address: address!.toLowerCase(), text: t, ts: Date.now() };
    all[id] = [...(all[id] ?? []), row].slice(-300);
    kv.set("postComments", all);
    return { ok: true, count: all[id].length, comment: enrich([row])[0] };
  });

  app.get<{ Params: { postId: string } }>("/api/post-comments/:postId", async (req) => {
    return { comments: enrich(postCommentsOf(req.params.postId)) };
  });

  // ── profile tabs: liked markets + @mentions ──
  app.get<{ Params: { address: string } }>("/api/liked/:address", async (req, reply) => {
    if (!isAddr(req.params.address)) return reply.code(400).send({ error: "address" });
    const a = req.params.address.toLowerCase();
    const all = kv.get<LikesMap>("likes", {});
    const ids = Object.entries(all).filter(([, addrs]) => addrs.includes(a)).map(([id]) => Number(id));
    return { marketIds: ids };
  });

  app.get<{ Params: { name: string } }>("/api/mentions/:name", async (req) => {
    const handle = String(req.params.name).toLowerCase().replace(/^@/, "");
    const rx = new RegExp(`@${handle}\\b`, "i");
    const posts = kv.get<PostRow[]>("posts", []).filter((p) => rx.test(p.text)).map((p) => ({ ...p, kind: "post" as const }));
    const cm = kv.get<CommentsMap>("comments", {});
    const comments = Object.entries(cm).flatMap(([mid, rows]) =>
      rows.filter((c) => rx.test(c.text)).map((c) => ({ ...c, kind: "comment" as const, marketId: Number(mid) })),
    );
    const items = enrich([...posts, ...comments].sort((a, b) => b.ts - a.ts).slice(0, 50) as any);
    return { mentions: items };
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
