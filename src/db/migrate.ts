import { getDb, runSchema } from "./client.js";

/** Standalone migration entrypoint: `npm run migrate`. */
async function main() {
  const db = await getDb();
  await runSchema(db);
  console.log(`[migrate] schema ready (driver: ${db.driver})`);
  await db.close();
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
