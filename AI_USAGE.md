# AI Usage Note

## Which AI tools I used

- **Claude Code** (Anthropic's agentic CLI, Opus model) — the primary tool. Used to
  scaffold the project, draft the backend and frontend, write tests, and run/verify the
  app in a browser.

## What I used them for

- Scaffolding the repo structure, config, and build tooling (TypeScript, Vite, Vitest,
  npm workspaces).
- Drafting the mechanical, high-volume code: the DB abstraction, SQL schema, repository
  queries, serializers, React components, and CSS.
- Generating the intentionally-imperfect sample dataset covering every data-quality case
  in the brief.
- Writing the test suite (parser edge cases, every validation rule, API integration).
- Producing the first drafts of this documentation.

## How AI helped me move faster

- Eliminated boilerplate: the Express/route/serializer/DB plumbing and the React
  component shells were written in minutes rather than hours, leaving time to focus on the
  parts that actually carry the judgment — the **data model** and the **validation +
  status design**.
- Fast feedback loop: the tool ran `typecheck` and the Vitest suite after changes and
  drove the running UI in a browser, so regressions surfaced immediately instead of at the
  end.

## What AI-generated output I changed or corrected

- **Empty-vs-missing input semantics.** The first draft rejected a whitespace-only upload
  as a "missing field" (`bad_request`). I changed it so a *provided but empty* dataset is
  treated as an empty dataset and recorded as a **`failed` batch** — which matches the
  brief's "empty dataset" error case and preserves it in ingestion history. A test now
  pins this behavior.
- **PGlite directory creation.** The embedded DB failed on first run because PGlite's
  Node FS adapter doesn't create parent directories. I added an explicit recursive
  `mkdir` before initialization.
- **Strict-null / `noUncheckedIndexedAccess` fixes** across the route handlers that the
  first draft didn't satisfy.
- Tightened the **validation/review status distinction** so the two axes stay orthogonal
  (an invalid record can be resolved), rather than collapsing them.

## How I verified the code

- `npm run typecheck` (backend) and `tsc -b` (frontend) both clean.
- **23 automated tests** pass: CSV/JSON parsing edge cases, every validation rule,
  cross-row duplicate detection, and a full API integration test against an in-memory
  Postgres (PGlite).
- **Manual end-to-end run in a browser**: ingested the sample dataset, confirmed the
  20-row split (5 valid / 4 warning / 11 invalid), opened flagged records, read the issue
  detail, filtered by status, and marked a record resolved — then re-queried the API to
  confirm the review status and timestamp persisted.

## Where I intentionally did not rely on AI

- **Data model and the status model.** The three-table shape, the decision to store both
  `raw` and `normalized`, and the deliberate split between `validation_status` (computed)
  and `review_status` (human workflow) are design decisions I made and directed; AI wrote
  them out, but the shape is mine.
- **Which validation rules matter and their severities** (error vs warning) — a product
  judgment about what should block a record vs merely flag it.
- **Stack tradeoff** — choosing embedded PGlite over the "preferred" FastAPI/Postgres for
  zero-setup local runs, and being able to justify it.
- I read every file before accepting it; nothing was merged unread.

## How this differs from how I used AI 6–12 months ago

Six to twelve months ago AI assistance was mostly **snippet-level**: autocomplete and
"write this function" prompts pasted into an editor, with me manually wiring pieces
together and running the app myself. Now the workflow is **agentic and verified in the
loop** — the tool operates across the whole repo, runs the type checker and tests, and
actually exercises the running app in a browser before claiming something works. That
shifts my role from "typing the code" to **specifying the architecture, reviewing diffs,
and owning the correctness bar** — deciding what to build and confirming it's right, while
delegating the mechanical writing. I trust it more with plumbing and less with judgment
calls, and I verify claims against real test/UI output rather than taking "it works" at
face value.
