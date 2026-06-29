import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { setPersistHook, STORE_NAMES, STORE_DIR } from "./store.js";

// BE12 — optional Postgres durability. Each store blob (a table's row-array or the kv
// object) is persisted as ONE JSONB row keyed by name. The local JSON files stay the hot
// synchronous read cache (so the existing sync db.* interface is unchanged); Postgres is
// the durable source of truth — hydrated into the cache at boot and written through on
// every change. Enabled only when DATABASE_URL is set; otherwise the app is file-only.
//
// This intentionally keeps the blob-per-table shape (durable, backup-able, zero call-site
// changes). Normalized relational tables can come later without touching app code.

export const pgEnabled = !!process.env.DATABASE_URL;

let pool: any = null;
let queue: Promise<void> = Promise.resolve(); // serialize write-through to avoid races

export async function initPgStore(): Promise<boolean> {
  if (!pgEnabled) return false;
  const pg = await import("pg");
  const Pool = (pg as any).default?.Pool ?? (pg as any).Pool;
  pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

  await pool.query(
    `CREATE TABLE IF NOT EXISTS justify_store (
       name TEXT PRIMARY KEY,
       data JSONB NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );

  // hydrate the local JSON cache from Postgres (source of truth) before anything reads it
  for (const name of STORE_NAMES) {
    const r = await pool.query("SELECT data FROM justify_store WHERE name=$1", [name]);
    if (r.rows[0]) writeFileSync(join(STORE_DIR, `${name}.json`), JSON.stringify(r.rows[0].data, null, 2));
  }

  // write-through: mirror each local write to Postgres (serialized; logged on failure)
  setPersistHook((name, data) => {
    queue = queue.then(() =>
      pool
        .query(
          `INSERT INTO justify_store(name, data, updated_at) VALUES($1, $2, now())
           ON CONFLICT (name) DO UPDATE SET data = $2, updated_at = now()`,
          [name, JSON.stringify(data)],
        )
        .then(
          () => {},
          (e: Error) => console.error(`[pg-store] persist ${name}:`, e.message),
        ),
    );
  });

  return true;
}
