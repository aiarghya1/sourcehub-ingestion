// Mirror of the backend API shapes (src/domain/types.ts + serializers).
// Kept as a hand-written mirror to avoid coupling the web build to backend paths.

export type BatchStatus =
  | "pending"
  | "processing"
  | "completed"
  | "completed_with_issues"
  | "failed";

export type ValidationStatus = "valid" | "warning" | "invalid";
export type ReviewStatus = "needs_review" | "reviewed" | "resolved";
export type Severity = "error" | "warning";

export interface Totals {
  total: number;
  valid: number;
  warning: number;
  invalid: number;
}

export interface Batch {
  id: string;
  sourceLabel: string;
  sourceFilename: string | null;
  status: BatchStatus;
  totals: Totals;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Issue {
  id: string;
  field: string | null;
  issueType: string;
  severity: Severity;
  message: string;
}

export interface Normalized {
  sourceRowId: string | null;
  clientName: string | null;
  entityName: string | null;
  state: string | null;
  jurisdictionType: string | null;
  taxYear: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  grossSales: number | null;
  transactionCount: number | null;
  filingFrequency: string | null;
  nexusIndicator: boolean | null;
  notes: string | null;
}

export interface Record {
  id: string;
  batchId: string;
  rowNumber: number;
  sourceRowId: string | null;
  raw: { [k: string]: string };
  normalized: Normalized | null;
  validationStatus: ValidationStatus;
  reviewStatus: ReviewStatus;
  errorCount: number;
  warningCount: number;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  issues?: Issue[];
}

export interface Pagination {
  total: number;
  limit: number;
  offset: number;
}
