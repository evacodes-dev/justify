import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const FILE = join(process.cwd(), "social.json");

export type Comment = { author: string; ens?: string; text: string; ts: number };
type Social = Record<string, { likes: string[]; comments: Comment[] }>;

function load(): Social { try { return existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {}; } catch { return {}; } }
function save(s: Social) { writeFileSync(FILE, JSON.stringify(s, null, 2)); }
function entry(s: Social, id: string) { if (!s[id]) s[id] = { likes: [], comments: [] }; return s[id]; }

export function getSocial(id: string, viewer?: string) {
  const e = load()[id] ?? { likes: [], comments: [] };
  return { likes: e.likes.length, liked: viewer ? e.likes.includes(viewer.toLowerCase()) : false, comments: e.comments };
}
export function toggleLike(id: string, address: string) {
  const s = load(); const e = entry(s, id); const a = address.toLowerCase();
  const i = e.likes.indexOf(a);
  if (i >= 0) e.likes.splice(i, 1); else e.likes.push(a);
  save(s);
  return { likes: e.likes.length, liked: i < 0 };
}
export function addComment(id: string, c: Comment) {
  const s = load(); const e = entry(s, id);
  e.comments.unshift(c);
  e.comments = e.comments.slice(0, 100);
  save(s);
  return e.comments;
}
