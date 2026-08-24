import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "../config.js";

/**
 * A tiny database abstraction so the rest of the app never cares whether it is
 * talking to embedded PGlite (default, zero-setup) or a real Postgres server
 * (when DATABASE_URL is set). Both speak the same `$1` placeholder dialect and
 * return `{ rows }`, so we expose a single `query()` and a `tx()` helper.
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Run fn inside a transaction; commits on success, rolls back on throw. */
  tx<T>(fn: (q: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  readonly driver: "pglite" | "pg";
}

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Create a PGlite-backed Db at `dir` (or in-memory when omitted). Exposed for tests. */
export async function makePglite(dir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const target = dir ?? config.pgliteDir;
  // PGlite's node fs adapter does not create parent directories; ensure the path exists.
  if (!target.startsWith("memory://")) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(target, { recursive: true });
  }
  const pg = new PGlite(target);
  const api: Db = {
    driver: "pglite",
    async query(sql, params = []) {
      const res = await pg.query(sql, params);
      return { rows: res.rows as never[] };
    },
    async tx(fn) {
      // PGlite runs single-connection; emulate a transaction with BEGIN/COMMIT.
      await pg.query("BEGIN");
      try {
        const out = await fn(api);
        await pg.query("COMMIT");
        return out;
      } catch (err) {
        await pg.query("ROLLBACK");
        throw err;
      }
    },
    async close() {
      await pg.close();
    },
  };
  return api;
}

async function makePg(url: string): Promise<Db> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: url });
  const api: Db = {
    driver: "pg",
    async query(sql, params = []) {
      const res = await pool.query(sql, params);
      return { rows: res.rows as never[] };
    },
    async tx(fn) {
      const client = await pool.connect();
      const scoped: Db = {
        ...api,
        query: async (sql, params = []) => {
          const res = await client.query(sql, params);
          return { rows: res.rows as never[] };
        },
      };
      try {
        await client.query("BEGIN");
        const out = await fn(scoped);
        await client.query("COMMIT");
        return out;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
  return api;
}

let singleton: Promise<Db> | undefined;

/** Lazily create (once) and return the shared Db handle. */
export function getDb(): Promise<Db> {
  if (!singleton) {
    singleton = config.databaseUrl ? makePg(config.databaseUrl) : makePglite();
  }
  return singleton;
}

/** Create the tables/indexes if they do not exist. Idempotent. */
export async function runSchema(db: Db): Promise<void> {
  const sql = await readFile(join(__dirname, "schema.sql"), "utf8");
  // PGlite executes one statement per call, so split on semicolons at line ends.
  for (const stmt of sql.split(/;\s*\n/)) {
    const trimmed = stmt.trim();
    if (trimmed) await db.query(trimmed);
  }
}
