import { randomUUID } from "node:crypto";
import { Db } from "../db/client.js";
import {
  BatchStatus,
  NormalizedRecord,
  RawRecord,
  ReviewStatus,
  ValidationIssue,
  ValidationStatus,
} from "../domain/types.js";

export interface BatchRow {
  id: string;
  source_label: string;
  source_filename: string | null;
  status: BatchStatus;
  total_records: number;
  valid_records: number;
  warning_records: number;
  invalid_records: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecordRow {
  id: string;
  batch_id: string;
  row_number: number;
  source_row_id: string | null;
  raw: RawRecord;
  normalized: NormalizedRecord | null;
  validation_status: ValidationStatus;
  review_status: ReviewStatus;
  error_count: number;
  warning_count: number;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IssueRow {
  id: string;
  record_id: string;
  batch_id: string;
  field: string | null;
  issue_type: string;
  severity: string;
  message: string;
  created_at: string;
}

/** Coerce a JSONB column that some drivers hand back as a string. */
function json<T>(value: unknown): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : (value as T);
}

export interface PersistRecordInput {
  rowNumber: number;
  sourceRowId: string | null;
  raw: RawRecord;
  normalized: NormalizedRecord | null;
  validationStatus: ValidationStatus;
  reviewStatus: ReviewStatus;
  errorCount: number;
  warningCount: number;
  issues: ValidationIssue[];
}

export interface CreateBatchInput {
  sourceLabel: string;
  sourceFilename: string | null;
  status: BatchStatus;
  totals: { total: number; valid: number; warning: number; invalid: number };
  errorMessage: string | null;
  records: PersistRecordInput[];
}

/** Insert a batch, its records, and their issues atomically. */
export async function insertBatch(db: Db, input: CreateBatchInput): Promise<string> {
  const batchId = randomUUID();
  await db.tx(async (q) => {
    await q.query(
      `INSERT INTO ingestion_batches
         (id, source_label, source_filename, status, total_records, valid_records, warning_records, invalid_records, error_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        batchId,
        input.sourceLabel,
        input.sourceFilename,
        input.status,
        input.totals.total,
        input.totals.valid,
        input.totals.warning,
        input.totals.invalid,
        input.errorMessage,
      ],
    );

    for (const rec of input.records) {
      const recordId = randomUUID();
      await q.query(
        `INSERT INTO ingested_records
           (id, batch_id, row_number, source_row_id, raw, normalized, validation_status, review_status, error_count, warning_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          recordId,
          batchId,
          rec.rowNumber,
          rec.sourceRowId,
          JSON.stringify(rec.raw),
          rec.normalized ? JSON.stringify(rec.normalized) : null,
          rec.validationStatus,
          rec.reviewStatus,
          rec.errorCount,
          rec.warningCount,
        ],
      );
      for (const issue of rec.issues) {
        await q.query(
          `INSERT INTO validation_issues (id, record_id, batch_id, field, issue_type, severity, message)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [randomUUID(), recordId, batchId, issue.field, issue.issueType, issue.severity, issue.message],
        );
      }
    }
  });
  return batchId;
}

export async function listBatches(db: Db): Promise<BatchRow[]> {
  const { rows } = await db.query<BatchRow>(
    `SELECT * FROM ingestion_batches ORDER BY created_at DESC`,
  );
  return rows;
}

export async function getBatch(db: Db, id: string): Promise<BatchRow | null> {
  const { rows } = await db.query<BatchRow>(`SELECT * FROM ingestion_batches WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export interface RecordFilter {
  validationStatus?: ValidationStatus;
  reviewStatus?: ReviewStatus;
  limit: number;
  offset: number;
}

export async function listRecords(
  db: Db,
  batchId: string,
  filter: RecordFilter,
): Promise<{ records: RecordRow[]; total: number }> {
  const where: string[] = ["batch_id = $1"];
  const params: unknown[] = [batchId];
  if (filter.validationStatus) {
    params.push(filter.validationStatus);
    where.push(`validation_status = $${params.length}`);
  }
  if (filter.reviewStatus) {
    params.push(filter.reviewStatus);
    where.push(`review_status = $${params.length}`);
  }
  const whereSql = where.join(" AND ");

  const countRes = await db.query<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM ingested_records WHERE ${whereSql}`,
    params,
  );
  const total = Number(countRes.rows[0]?.count ?? 0);

  params.push(filter.limit, filter.offset);
  const { rows } = await db.query<RecordRow>(
    `SELECT * FROM ingested_records WHERE ${whereSql}
     ORDER BY row_number ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  for (const r of rows) {
    r.raw = json(r.raw);
    r.normalized = r.normalized ? json(r.normalized) : null;
  }
  return { records: rows, total };
}

export async function getRecord(db: Db, id: string): Promise<RecordRow | null> {
  const { rows } = await db.query<RecordRow>(`SELECT * FROM ingested_records WHERE id = $1`, [id]);
  const row = rows[0];
  if (!row) return null;
  row.raw = json(row.raw);
  row.normalized = row.normalized ? json(row.normalized) : null;
  return row;
}

export async function getIssuesForRecord(db: Db, recordId: string): Promise<IssueRow[]> {
  const { rows } = await db.query<IssueRow>(
    `SELECT * FROM validation_issues WHERE record_id = $1 ORDER BY severity DESC, created_at ASC`,
    [recordId],
  );
  return rows;
}

export async function getIssuesForRecords(db: Db, recordIds: string[]): Promise<IssueRow[]> {
  if (recordIds.length === 0) return [];
  const placeholders = recordIds.map((_, i) => `$${i + 1}`).join(",");
  const { rows } = await db.query<IssueRow>(
    `SELECT * FROM validation_issues WHERE record_id IN (${placeholders}) ORDER BY severity DESC, created_at ASC`,
    recordIds,
  );
  return rows;
}

export async function getIssuesForBatch(db: Db, batchId: string): Promise<IssueRow[]> {
  const { rows } = await db.query<IssueRow>(
    `SELECT * FROM validation_issues WHERE batch_id = $1 ORDER BY record_id, severity DESC`,
    [batchId],
  );
  return rows;
}

export async function updateReviewStatus(
  db: Db,
  recordId: string,
  reviewStatus: ReviewStatus,
  note: string | null,
): Promise<RecordRow | null> {
  const { rows } = await db.query<RecordRow>(
    `UPDATE ingested_records
       SET review_status = $2,
           review_note = COALESCE($3, review_note),
           reviewed_at = CASE WHEN $2 = 'needs_review' THEN NULL ELSE now() END,
           updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [recordId, reviewStatus, note],
  );
  const row = rows[0];
  if (!row) return null;
  row.raw = json(row.raw);
  row.normalized = row.normalized ? json(row.normalized) : null;
  return row;
}
