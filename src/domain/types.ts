/**
 * Domain vocabulary shared across the backend (and mirrored in web/src/lib/types.ts).
 *
 * Two status axes are modeled deliberately and kept orthogonal:
 *  - validationStatus is a *computed property of the data*: does the row pass the rules?
 *  - reviewStatus is a *human workflow state*: has an analyst looked at / signed off on it?
 * A record can be Invalid + Resolved (analyst acknowledged and dispositioned it) or
 * Valid + Reviewed. Keeping them separate is what lets the review queue work.
 */

export const BatchStatus = {
  Pending: "pending",
  Processing: "processing",
  Completed: "completed",
  CompletedWithIssues: "completed_with_issues",
  Failed: "failed",
} as const;
export type BatchStatus = (typeof BatchStatus)[keyof typeof BatchStatus];

export const ValidationStatus = {
  Valid: "valid",
  Warning: "warning",
  Invalid: "invalid",
} as const;
export type ValidationStatus = (typeof ValidationStatus)[keyof typeof ValidationStatus];

export const ReviewStatus = {
  NeedsReview: "needs_review",
  Reviewed: "reviewed",
  Resolved: "resolved",
} as const;
export type ReviewStatus = (typeof ReviewStatus)[keyof typeof ReviewStatus];

export const Severity = {
  Error: "error",
  Warning: "warning",
} as const;
export type Severity = (typeof Severity)[keyof typeof Severity];

/** Stable machine codes for issue types, so the UI/consumers can branch on them. */
export const IssueType = {
  RequiredFieldMissing: "required_field_missing",
  InvalidState: "invalid_state",
  InvalidDate: "invalid_date",
  PeriodOrder: "period_end_before_start",
  NonNumeric: "non_numeric",
  NegativeValue: "negative_value",
  OutOfRange: "out_of_range",
  UnknownEnum: "unknown_enum",
  AmbiguousValue: "ambiguous_value",
  DuplicateSourceRowId: "duplicate_source_row_id",
  MalformedRow: "malformed_row",
  BlankEntityName: "blank_entity_name",
} as const;
export type IssueType = (typeof IssueType)[keyof typeof IssueType];

export interface ValidationIssue {
  field: string | null;
  issueType: IssueType;
  severity: Severity;
  message: string;
}

/** Canonical, typed shape of a sales-activity row after normalization. */
export interface NormalizedRecord {
  sourceRowId: string | null;
  clientName: string | null;
  entityName: string | null;
  state: string | null;
  jurisdictionType: string | null;
  taxYear: number | null;
  periodStart: string | null; // ISO YYYY-MM-DD
  periodEnd: string | null; // ISO YYYY-MM-DD
  grossSales: number | null;
  transactionCount: number | null;
  filingFrequency: string | null;
  nexusIndicator: boolean | null;
  notes: string | null;
}

/** The raw row exactly as parsed from the file (header -> string cell). */
export type RawRecord = Record<string, string>;
