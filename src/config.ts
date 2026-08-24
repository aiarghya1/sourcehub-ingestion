/**
 * Runtime configuration, read once from the environment.
 * All values have safe local-first defaults so the app runs with zero setup.
 */
export const config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: process.env.DATABASE_URL?.trim() || undefined,
  pgliteDir: process.env.PGLITE_DIR?.trim() || "./.data/pglite",
  /** Serve the built frontend (web/dist) from the API in production. */
  serveWeb: process.env.SERVE_WEB !== "false",
} as const;

export type Config = typeof config;
