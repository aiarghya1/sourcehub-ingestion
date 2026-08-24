import express, { Express } from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Db } from "../db/client.js";
import { config } from "../config.js";
import { errorHandler } from "./errors.js";
import { makeRouter } from "./routes/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Build the Express app around an injected Db (so tests can supply their own). */
export function createApp(db: Db): Express {
  const app = express();
  app.use(express.json({ limit: "10mb" })); // dataset uploads arrive as JSON-encoded text

  app.get("/api/health", (_req, res) => res.json({ ok: true, driver: db.driver }));
  app.use("/api", makeRouter(db));

  // In production, serve the built SPA and let client-side routing handle the rest.
  const webDist = join(__dirname, "..", "..", "web", "dist");
  if (config.serveWeb && existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(join(webDist, "index.html")));
  }

  app.use(errorHandler);
  return app;
}
