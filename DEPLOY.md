# Deploying SourceHub Ingestion

**Live instance:** https://sourcehub-ingestion.onrender.com (Render free tier — first
request after idle cold-starts in ~30–60s).

The app is a single Node process that serves both the JSON API and the built React
SPA, and creates its database schema on boot — so any host that runs a long-lived
Node process will work with no extra release step.

Two ready-to-use paths are included:

---

## Option A — Render (recommended, free, GitHub-connected)

The repo ships a **`render.yaml`** blueprint.

1. Go to the [Render dashboard](https://dashboard.render.com) and sign in with GitHub.
2. **New +** → **Blueprint** → select the `aiarghya1/sourcehub-ingestion` repo.
3. Render reads `render.yaml`, provisions a free web service, runs
   `npm ci && npm run build`, then `npm start`, and health-checks `/api/health`.
4. When it goes green, open the service URL — the review UI loads; click
   **"Use sample dataset"** to ingest.

**Data persistence note:** the default embedded PGlite DB lives on the instance disk,
which is **ephemeral on the free plan** (resets on redeploy/restart) — fine for a demo.
For durable storage, create a managed Postgres (e.g. [Supabase](https://supabase.com))
and add its connection string as a `DATABASE_URL` environment variable in the Render
service; the app detects it and uses it automatically (no code change).

---

## Option B — Any container host (Docker)

A multi-stage **`Dockerfile`** is included and verified.

```bash
docker build -t sourcehub-ingestion .
docker run -p 8080:3001 -e PORT=3001 sourcehub-ingestion
# open http://localhost:8080
```

This same image deploys to Railway, Fly.io, Google Cloud Run, AWS App Runner, etc.
The host injects `PORT`; the app binds it automatically. To use managed Postgres,
pass `-e DATABASE_URL=postgresql://…`.

---

## What the host runs

| Step  | Command                | Notes                                             |
| ----- | ---------------------- | ------------------------------------------------- |
| Build | `npm ci && npm run build` | builds API → `dist/` and SPA → `web/dist/`     |
| Start | `npm start`            | `node dist/index.js` serves API + SPA on `$PORT`  |
| Health| `GET /api/health`      | returns `{ ok, driver }`                           |
| DB    | auto                   | schema created on boot; PGlite by default, Postgres if `DATABASE_URL` set |
