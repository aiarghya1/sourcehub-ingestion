import { Db, makePglite, runSchema } from "../src/db/client.js";

/** Fresh in-memory PGlite database with the schema applied, per test. */
export async function freshDb(): Promise<Db> {
  const db = await makePglite("memory://");
  await runSchema(db);
  return db;
}
