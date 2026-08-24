# SourceHub — Client Deliverable Ingestion Workbench

[![CI](https://github.com/aiarghya1/sourcehub-ingestion/actions/workflows/ci.yml/badge.svg)](https://github.com/aiarghya1/sourcehub-ingestion/actions/workflows/ci.yml)

**▶ Live demo: https://sourcehub-ingestion.onrender.com** — open it and click
*"Use sample dataset"*. (Hosted on Render's free tier, so the first request after
idle may take ~30–60s to cold-start.)

A small full-stack feature that lets a SourceHub user **ingest** a client-provided
sales-activity deliverable (CSV or JSON), **validate** every record against data-quality
rules, **store** the batch and records, and **review / resolve** data quality issues
through a web UI.

End-to-end slice: upload → parse → validate (row-level + cross-row) → persist →
review queue → per-record resolution.

> **Deploy:** the app runs as one Node process (API + built SPA) and is
> container-verified. See [DEPLOY.md](DEPLOY.md) — a Render blueprint (`render.yaml`)
> and a `Dockerfile` are included for one-click / one-command hosting.

---

## Table of contents

1. [Stack & rationale](#stack--rationale)
2. [Quick start](#quick-start)
3. [Project structure](#project-structure)
4. [Data model](#data-model)
5. [API description](#api-description)
6. [Validation rules](#validation-rules)
7. [Status model — validation vs review](#status-model--validation-vs-review)
8. [Architecture notes](#architecture-notes)
9. [Error handling](#error-handling)
10. [Testing](#testing)
11. [Known limitations & what I'd improve](#known-limitations--what-id-improve)

---

## Stack & rationale

| Layer     | Choice                                             |
| --------- | -------------------------------------------------- |
| Backend   | Node.js + TypeScript, Express, Zod                 |
| Database  | Embedded **PGlite** (Postgres in-process) by default; any Postgres via `DATABASE_URL` |
| Frontend  | React + TypeScript (Vite)                          |
| Tests     | Vitest (unit + API integration)                    |

**Why not the "preferred" FastAPI + Postgres stack?** The exercise explicitly allows a
different stack with reasoning. I chose TypeScript end-to-end and an **embedded**
Postgres-compatible database (PGlite) for two deliberate reasons:

1. **Zero-setup local run.** No Python env, no running Postgres server, no Docker. A
   reviewer runs `npm install && npm run migrate && npm run dev` and it works. PGlite
   persists to `./.data/pglite`, and the exact same SQL runs against a real Postgres by
   setting `DATABASE_URL` — so the "relational, Postgres" intent is fully honored.
2. **One language, shared types.** The domain vocabulary (statuses, issue types,
   normalized record shape) lives in TypeScript and is mirrored on the frontend, which
   keeps the validation contract tight across the stack.

The DB access layer (`src/db/client.ts`) is a thin abstraction over both PGlite and
`pg`, so switching to hosted Postgres is a one-line env change, not a rewrite.

---

## Quick start

Requires **Node 20+**.

```bash
npm install            # installs backend + web workspace
npm run migrate        # creates tables (embedded PGlite by default)
npm run dev            # API on :3001, Vite UI on :5173 (proxies /api -> :3001)
```

Open **http://localhost:5173** and click **"Use sample dataset"** to ingest the bundled
`data/sample.csv` (20 rows of intentionally imperfect data), or upload your own CSV/JSON.

### Production-style single-process run

```bash
npm run build          # builds API (dist/) and web (web/dist/)
npm start              # API serves the built SPA + API on :3001
```

Open **http://localhost:3001**.

### Using a real Postgres instead of embedded PGlite

```bash
export DATABASE_URL=postgresql://user:pass@localhost:5432/sourcehub
npm run migrate && npm run dev
```

---

## Project structure

```
src/
  config.ts                 env-driven config with local-first defaults
  domain/types.ts           shared enums: batch/validation/review status, issue types
  db/
    client.ts               Db abstraction (PGlite | pg), tx() helper, schema loader
    schema.sql              portable DDL (3 tables + indexes)
    migrate.ts              `npm run migrate` entrypoint
  ingestion/
    parse.ts                RFC4180-ish CSV parser + JSON parser (malformed-tolerant)
    repository.ts           all SQL queries (batches, records, issues)
    service.ts              orchestration: parse -> validate -> derive status -> persist
  validation/
    states.ts               US state set, filing-frequency + nexus normalization
    validate.ts             per-row rules + cross-row duplicate detection
  http/
    server.ts               Express app factory (Db injected for testability)
    errors.ts               ApiError + consistent JSON error envelope
    serialize.ts            snake_case DB rows -> camelCase API shapes
    routes/index.ts         all endpoints
  index.ts                  startup: migrate + listen
web/
  src/
    App.tsx                 orchestration + all frontend states
    lib/{api,types}.ts      typed fetch client + mirrored API types
    components/             BatchList, UploadPanel, BatchSummary, RecordsTable,
                            RecordDetail, badges
test/
  parse.test.ts             CSV/JSON edge cases (quotes, malformed, empty)
  validate.test.ts          every validation rule + cross-row duplicates
  api.test.ts               end-to-end API against in-memory PGlite
data/sample.csv             20-row sample covering every imperfect-data case
```

---

## Data model

Three relational tables (`src/db/schema.sql`). IDs are UUIDs generated in the app so we
don't depend on DB extensions.

**`ingestion_batches`** — one per upload.

| column                                            | notes                                                  |
| ------------------------------------------------- | ------------------------------------------------------ |
| `id`                                              | PK                                                     |
| `source_label`, `source_filename`                 | user label + original filename                         |
| `status`                                          | `pending` / `processing` / `completed` / `completed_with_issues` / `failed` |
| `total_records`, `valid_records`, `warning_records`, `invalid_records` | summary counts                    |
| `error_message`                                   | populated for `failed` batches                         |
| `created_at`, `updated_at`                        | timestamps                                             |

**`ingested_records`** — one per source row.

| column                            | notes                                                          |
| --------------------------------- | -------------------------------------------------------------- |
| `id`                              | PK                                                             |
| `batch_id`                        | FK → `ingestion_batches` (cascade delete)                     |
| `row_number`                      | 1-based position in the source file (traceability)             |
| `source_row_id`                   | as provided; may be missing/duplicated                         |
| `raw` (jsonb)                     | **parsed source values** — original, untrimmed, header-aligned; extra cells from malformed rows preserved under `column_N` keys |
| `normalized` (jsonb)              | **typed/normalized values** (null when the row is malformed)   |
| `validation_status`               | `valid` / `warning` / `invalid` (computed)                     |
| `review_status`                   | `needs_review` / `reviewed` / `resolved` (workflow)            |
| `error_count`, `warning_count`    | denormalized for fast table rendering                          |
| `review_note`, `reviewed_at`      | audit of the review action                                     |
| `created_at`, `updated_at`        | timestamps                                                     |

**`validation_issues`** — zero-to-many per record.

| column        | notes                                                                  |
| ------------- | ---------------------------------------------------------------------- |
| `id`          | PK                                                                     |
| `record_id`   | FK → `ingested_records` (cascade)                                      |
| `batch_id`    | FK → `ingestion_batches` (denormalized for batch-level issue queries)  |
| `field`       | offending field, or `null` for row-level issues (malformed/duplicate)  |
| `issue_type`  | stable machine code (e.g. `invalid_state`, `period_end_before_start`)  |
| `severity`    | `error` / `warning`                                                    |
| `message`     | human-readable explanation                                             |

Indexes cover the hot paths: records by batch, by `(batch, validation_status)`, by
`(batch, review_status)`, and issues by record and by batch.

---

## API description

Base path `/api`. All responses are JSON. Errors use a consistent envelope:
`{ "error": { "code", "message", "details?" } }`.

| Method & path                          | Purpose                                                               |
| -------------------------------------- | --------------------------------------------------------------------- |
| `GET /api/health`                      | liveness + active DB driver                                           |
| `POST /api/batches`                    | **Create an ingestion batch.** Body: `{ sourceLabel, filename?, format?: "csv"\|"json", content }` or `{ sourceLabel, useSample: true }`. Returns `201 { batch }`. Parse-level failures return `400 { error, batch }` where `batch.status === "failed"`. |
| `GET /api/batches`                     | List all batches (newest first) with summary counts + status.        |
| `GET /api/batches/:id`                 | One batch.                                                            |
| `GET /api/batches/:id/records`         | Records for a batch, **filterable** (`validationStatus`, `reviewStatus`) and **paginated** (`limit`, `offset`). Each record embeds its `issues`. |
| `GET /api/batches/:id/issues`          | **All validation issues for a batch** (each with its `recordId`).     |
| `GET /api/records/:id`                 | One record with its full issue list.                                  |
| `PATCH /api/records/:id/review`        | **Update review status.** Body `{ reviewStatus, note? }`. Sets/clears `reviewed_at`. |

Example — ingest and inspect:

```bash
curl -s -X POST localhost:3001/api/batches \
  -H 'content-type: application/json' \
  -d '{"sourceLabel":"Q1 client file","useSample":true}'

curl -s "localhost:3001/api/batches/<id>/records?validationStatus=invalid"

curl -s -X PATCH localhost:3001/api/records/<recordId>/review \
  -H 'content-type: application/json' \
  -d '{"reviewStatus":"resolved","note":"Confirmed with client"}'
```

---

## Validation rules

Implemented in `src/validation/validate.ts`. Each issue carries `field`, `issueType`,
`severity`, and a human-readable `message`.

**Errors** (make a record `invalid`):

- **Required fields** missing (`source_row_id`, `client_name`, `state`, `tax_year`,
  `period_start`, `period_end`, `gross_sales`, `transaction_count`)
- **Invalid state** abbreviation (checked against 50 states + DC + US territories)
- **Invalid date** format / non-calendar date (strict `YYYY-MM-DD`, real calendar check)
- **Period end before period start**
- **Non-numeric** gross sales or transaction count
- **Negative** gross sales or transaction count
- **Non-integer** tax year
- **Duplicate `source_row_id`** within the batch (cross-row rule; flags every member of
  the duplicate group and lists the colliding line numbers)
- **Malformed row** (column count ≠ header; field-level rules are skipped and the raw row
  is still stored for traceability)

**Warnings** (make a record `warning`, not blocked):

- **Blank entity name**
- **Unknown filing frequency** (unrecognized value; kept but flagged)
- **Ambiguous nexus indicator** (not a recognized yes/no spelling)
- **Out-of-range tax year** (outside 2000–2100)

Normalization runs alongside validation: state upper-cased, dates ISO-normalized, numbers
coerced, filing frequency canonicalized, nexus mapped to a boolean. Both the `raw` and
`normalized` forms are persisted.

---

## Status model — validation vs review

The two status axes are modeled **orthogonally and deliberately**:

- **`validation_status`** is a *computed property of the data*: does the row pass the
  rules? (`valid` / `warning` / `invalid`) It is derived from the issues and never edited
  by a human.
- **`review_status`** is a *human workflow state*: has an analyst looked at / signed off
  on the record? (`needs_review` / `reviewed` / `resolved`)

They're independent, which is the whole point of a review queue: a record can be
**Invalid + Resolved** (analyst acknowledged the issue and dispositioned it) or
**Valid + Reviewed**. On ingestion, clean rows default to `reviewed` (nothing to do);
anything with an issue enters the queue as `needs_review`.

---

## Architecture notes

**How I structured the ingestion workflow.** A single service function
(`ingestDataset`) runs the pipeline synchronously: parse the raw text → validate each row
→ apply the cross-row duplicate pass → derive per-record review status and the overall
batch status → persist the batch, records, and issues in **one transaction**. The parser
is deliberately tolerant: malformed rows are captured and stored rather than aborting the
whole file.

**What data model I chose and why.** The classic three-table shape
(batch → records → issues) mirrors the domain exactly and keeps issues queryable
independently of records. I store both `raw` (parsed source values, untrimmed) and `normalized`
(typed) JSON on each record so nothing from the client file is ever lost, while the app
still gets clean typed values. Counts are denormalized onto the batch and record rows so
the list/table views render without aggregation queries.

**What validation rules I implemented.** See [Validation rules](#validation-rules) — the
required set plus a few high-value additions (negative values, out-of-range year), each
with an explicit severity so warnings don't block a record the way errors do.

**How I thought about record status vs review status.** See
[Status model](#status-model--validation-vs-review). Keeping them orthogonal is what makes
"resolve an invalid record" a coherent action.

**What frontend states I accounted for.** Loading (batches, records), error (with retry),
empty (no batches / no records / filtered-to-nothing), ingesting (busy button), failed
ingestion (surfaced inline **and** immediately reflected as a `failed` batch in history —
no manual reload), paginated records (Prev/Next with a "Showing a–b of N" indicator),
row-level issue highlighting, and the review-in-progress state on the drawer.

**What would change for larger files or async processing.** Today's synchronous path is
fine for the exercise scale. For large files I'd: (a) accept the upload, immediately
create the batch as `pending` and return its id; (b) hand the file to a background worker
(a queue like BullMQ/SQS, or `pg`-backed job rows) that streams the CSV row-by-row instead
of loading it into memory, updates the batch to `processing`, and inserts records in
batches; (c) move counts to incremental updates; (d) let the UI poll `GET /batches/:id`
(or subscribe via SSE/websocket) to watch `pending → processing → completed`. The status
enum and data model already anticipate this — no schema change needed.

**What I'd improve before production.** See below.

---

## Error handling

| Failure case                 | Behavior                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| Empty dataset                | `400 ingestion_failed`, recorded as a **`failed` batch** with a reason  |
| Invalid file format          | `400` with a clear message (bad JSON, no detectable CSV header)         |
| Malformed rows               | Row stored as `invalid` with a `malformed_row` issue — file still ingests|
| Records with validation issues | Batch completes as `completed_with_issues`; issues shown per record   |
| No records found             | Empty arrays / `404` for a missing batch or record                      |
| Backend / unexpected error   | `500 internal_error` envelope; details logged server-side, not leaked   |
| Frontend can't reach API     | Friendly "Cannot reach the server" message with a Retry button          |

---

## Security & performance

**Security posture (for this exercise's scope):**

- **SQL injection** — every query is parameterized; only `$N` placeholder *indexes* are
  ever string-built, never user values (verified in `repository.ts`).
- **XSS** — the React UI renders all data as escaped text (no `dangerouslySetInnerHTML`,
  `innerHTML`, or `eval`).
- **Prototype pollution** — CSV/JSON header keys of `__proto__` / `constructor` /
  `prototype` are neutralized before being used as object keys (`parse.ts`, with a test).
- **Error leakage** — the error middleware logs details server-side and returns a generic
  envelope; stack traces never reach the client.
- **Input bounds** — request bodies are capped at 10 MB.
- **Dependency audit** — `npm audit` reports findings only in the **dev toolchain**
  (esbuild/vite/vitest dev server); nothing vulnerable ships in the production bundle.
- **Out of scope** (per the brief): authentication, authorization/multi-tenancy, and rate
  limiting — see below for how I'd add them.

**Performance:**

- Ingestion uses **chunked bulk `INSERT`s** (records and issues), so a file costs
  `O(chunks)` round-trips instead of `O(rows)`. A 3000-row file ingests in well under a
  second on the embedded engine (covered by a test).
- Read paths are indexed for the hot queries (records by batch and by status; issues by
  record/batch), and per-record issue counts are denormalized so the table renders without
  aggregation.

## Testing

The suite covers the full pyramid — **unit → integration → e2e** — with **43 automated
tests** (29 backend, 12 frontend, 2 e2e).

```bash
npm test          # backend: unit + API integration (Vitest, 29 tests)
npm run test:web  # frontend: component/unit (Vitest + React Testing Library, 12 tests)
npm run test:all  # both of the above
npm run typecheck # backend type safety

# End-to-end (real browser -> UI -> API -> DB), one-time browser setup:
npx playwright install chromium
npm run build && npm run e2e   # Playwright, 2 tests
```

**Unit** (`test/parse.test.ts`, `test/validate.test.ts`)
- Parser: quoted fields with embedded commas/quotes/newlines, malformed column counts,
  empty dataset, header-only, JSON parsing + rejection, prototype-pollution guard.
- Validation: every rule (valid path, each error, each warning, malformed short-circuit)
  plus cross-row duplicate detection.

**Integration** (`test/api.test.ts`)
- Spins up the real Express app against an in-memory PGlite DB and exercises ingest →
  list → batch issues → filter → review → **3000-row bulk insert** → failed-upload → 404.

**Frontend component** (`web/src/**/*.test.tsx`)
- Badges render correct labels/classes; `RecordsTable` flags invalid rows and fires
  selection; `App` loads batches, auto-selects, filters by status, opens the detail
  drawer, resolves a record, and shows an error+retry when the API fails (API mocked).

**End-to-end** (`e2e/ingestion.spec.ts`, Playwright)
- Drives the built app in a real browser: ingest the sample → see "Completed with Issues"
  → filter to invalid → open a flagged record → read its issue → mark resolved; plus the
  empty-upload failure path.

---

## Known limitations & what I'd improve

- **Synchronous ingestion** — see the async plan in the architecture notes.
- **Money as float** — `gross_sales` is currently stored as a JS number. For a tax product
  this should be a fixed-precision `NUMERIC`/decimal (IEEE-754 floats are lossy for
  currency). The validation layer already isolates parsing, so this is a contained change:
  keep the string, store `NUMERIC`, and compare with a decimal library.
- **Auth / multi-tenancy / rate limiting** — out of scope per the brief; production would
  scope batches to an org/user, gate the API, and rate-limit ingestion.
- **File upload** goes through a JSON body (frontend reads file text). Production would use
  streamed multipart upload for large files and store the original blob (S3) for audit.
- **Pagination** — the UI has server-driven Prev/Next paging (50/page) with a
  "Showing a–b of N" indicator; a production build would add page-size controls and row
  virtualization for very large batches.
- **Re-validation** — issues are computed at ingest time. A production system would let you
  re-run rules (e.g. after a rules change) and version rule sets.
- **Richer review workflow** — assignees, audit trail of status transitions, bulk
  resolve, and export of the cleaned dataset for downstream analysis.
- **Observability** — structured request logging, metrics, and error tracking.

See [AI_USAGE.md](AI_USAGE.md) for the required AI Usage Note.
