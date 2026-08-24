import { Db } from "../db/client.js";
import { BatchStatus, ReviewStatus, ValidationStatus } from "../domain/types.js";
import { EmptyDatasetError, InvalidFormatError, parseDataset } from "./parse.js";
import { insertBatch, PersistRecordInput } from "./repository.js";
import { validateRows } from "../validation/validate.js";

export interface IngestInput {
  sourceLabel: string;
  sourceFilename?: string | null;
  format: "csv" | "json";
  content: string;
}

export interface IngestResult {
  batchId: string;
  status: BatchStatus;
  totals: { total: number; valid: number; warning: number; invalid: number };
}

export { EmptyDatasetError, InvalidFormatError };

/**
 * End-to-end synchronous ingestion: parse -> validate (row + cross-row) ->
 * derive per-record review status and overall batch status -> persist atomically.
 *
 * Synchronous is fine at this scale; see README "larger files / async" for how
 * this function would become a job that streams the file and updates the batch
 * row from pending -> processing -> completed as it goes.
 */
export async function ingestDataset(db: Db, input: IngestInput): Promise<IngestResult> {
  const parsed = parseDataset(input.content, input.format); // throws Empty/InvalidFormat
  const validations = validateRows(parsed.rows);

  let valid = 0;
  let warning = 0;
  let invalid = 0;

  const records: PersistRecordInput[] = parsed.rows.map((row, i) => {
    const v = validations[i]!;
    if (v.validationStatus === ValidationStatus.Valid) valid++;
    else if (v.validationStatus === ValidationStatus.Warning) warning++;
    else invalid++;

    // Review-status default: anything with an issue enters the review queue;
    // clean rows need no human action and are pre-marked reviewed.
    const reviewStatus =
      v.validationStatus === ValidationStatus.Valid ? ReviewStatus.Reviewed : ReviewStatus.NeedsReview;

    return {
      rowNumber: row.rowNumber,
      sourceRowId: row.malformed ? null : (row.raw["source_row_id"]?.trim() || null),
      raw: row.raw,
      normalized: v.normalized,
      validationStatus: v.validationStatus,
      reviewStatus,
      errorCount: v.errorCount,
      warningCount: v.warningCount,
      issues: v.issues,
    };
  });

  const total = records.length;
  const status: BatchStatus =
    invalid > 0 || warning > 0 ? BatchStatus.CompletedWithIssues : BatchStatus.Completed;

  const batchId = await insertBatch(db, {
    sourceLabel: input.sourceLabel,
    sourceFilename: input.sourceFilename ?? null,
    status,
    totals: { total, valid, warning, invalid },
    errorMessage: null,
    records,
  });

  return { batchId, status, totals: { total, valid, warning, invalid } };
}
