import type { FastifyInstance } from "fastify";
import { db, kv } from "../store.js";

// Product social layer: likes on markets + follower graph for creators, with an
// unfollow confirmation handled client-side. kv-backed (durable once Postgres is on).

type LikesMap = Record<string, string[]>; // marketId -> lowercase addresses
type FollowsMap = Record<string, string[]>; // target address (lower) -> follower addresses

export const likesOf = (marketId: number | string): string[] =>
  kv.get<LikesMap>("likes", {})[String(marketId)] ?? [];
export const followersOf = (addressLower: string): string[] =>
  kv.get<FollowsMap>("follows", {})[addressLower] ?? [];

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
