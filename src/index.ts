import { config } from "./config.js";
import { getDb, runSchema } from "./db/client.js";
import { createApp } from "./http/server.js";

async function main() {
  const db = await getDb();
  await runSchema(db); // ensure tables exist (idempotent) so a fresh clone just works
  const app = createApp(db);
  app.listen(config.port, () => {
    console.log(`[sourcehub] API listening on http://localhost:${config.port} (db: ${db.driver})`);
  });
}

main().catch((err) => {
  console.error("[sourcehub] fatal startup error:", err);
  process.exit(1);
});
