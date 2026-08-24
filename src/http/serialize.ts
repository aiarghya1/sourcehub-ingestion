import { BatchRow, IssueRow, RecordRow } from "../ingestion/repository.js";

/** DB rows are snake_case; the API speaks camelCase. These are the only mappers. */

export function serializeBatch(b: BatchRow) {
  return {
    id: b.id,
    sourceLabel: b.source_label,
    sourceFilename: b.source_filename,
    status: b.status,
    totals: {
      total: b.total_records,
      valid: b.valid_records,
      warning: b.warning_records,
      invalid: b.invalid_records,
    },
    errorMessage: b.error_message,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  };
}

export function serializeIssue(i: IssueRow) {
  return {
    id: i.id,
    field: i.field,
    issueType: i.issue_type,
    severity: i.severity,
    message: i.message,
  };
}

export function serializeRecord(r: RecordRow, issues?: IssueRow[]) {
  return {
    id: r.id,
    batchId: r.batch_id,
    rowNumber: r.row_number,
    sourceRowId: r.source_row_id,
    raw: r.raw,
    normalized: r.normalized,
    validationStatus: r.validation_status,
    reviewStatus: r.review_status,
    errorCount: r.error_count,
    warningCount: r.warning_count,
    reviewNote: r.review_note,
    reviewedAt: r.reviewed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...(issues ? { issues: issues.map(serializeIssue) } : {}),
  };
}
