-- SourceHub ingestion schema. Written to be portable across PGlite and Postgres.
-- IDs are generated in the application (crypto.randomUUID) so we don't depend on
-- the pgcrypto/uuid-ossp extensions being available in the embedded engine.

CREATE TABLE IF NOT EXISTS ingestion_batches (
  id                TEXT PRIMARY KEY,
  source_label      TEXT NOT NULL,
  source_filename   TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
  total_records     INTEGER NOT NULL DEFAULT 0,
  valid_records     INTEGER NOT NULL DEFAULT 0,
  warning_records   INTEGER NOT NULL DEFAULT 0,
  invalid_records   INTEGER NOT NULL DEFAULT 0,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingested_records (
  id                TEXT PRIMARY KEY,
  batch_id          TEXT NOT NULL REFERENCES ingestion_batches(id) ON DELETE CASCADE,
  row_number        INTEGER NOT NULL,          -- 1-based line position in the source file
  source_row_id     TEXT,                      -- as provided; may be missing or duplicated
  raw               JSONB NOT NULL,            -- original row data, untouched
  normalized        JSONB,                     -- normalized/typed field values (null if unparseable)
  validation_status TEXT NOT NULL DEFAULT 'valid',
  review_status     TEXT NOT NULL DEFAULT 'reviewed',
  error_count       INTEGER NOT NULL DEFAULT 0,
  warning_count     INTEGER NOT NULL DEFAULT 0,
  review_note       TEXT,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS validation_issues (
  id                TEXT PRIMARY KEY,
  record_id         TEXT NOT NULL REFERENCES ingested_records(id) ON DELETE CASCADE,
  batch_id          TEXT NOT NULL REFERENCES ingestion_batches(id) ON DELETE CASCADE,
  field             TEXT,                       -- null for row-level issues (malformed/duplicate)
  issue_type        TEXT NOT NULL,
  severity          TEXT NOT NULL,              -- 'error' | 'warning'
  message           TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_records_batch          ON ingested_records(batch_id);
CREATE INDEX IF NOT EXISTS idx_records_batch_valid    ON ingested_records(batch_id, validation_status);
CREATE INDEX IF NOT EXISTS idx_records_batch_review   ON ingested_records(batch_id, review_status);
CREATE INDEX IF NOT EXISTS idx_issues_record          ON validation_issues(record_id);
CREATE INDEX IF NOT EXISTS idx_issues_batch           ON validation_issues(batch_id);
