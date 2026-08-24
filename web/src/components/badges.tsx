import type { BatchStatus, ReviewStatus, ValidationStatus } from "../lib/types";

const VALIDATION_LABEL: Record<ValidationStatus, string> = {
  valid: "Valid",
  warning: "Warning",
  invalid: "Invalid",
};

const REVIEW_LABEL: Record<ReviewStatus, string> = {
  needs_review: "Needs Review",
  reviewed: "Reviewed",
  resolved: "Resolved",
};

const BATCH_LABEL: Record<BatchStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  completed_with_issues: "Completed with Issues",
  failed: "Failed",
};

export function ValidationBadge({ status }: { status: ValidationStatus }) {
  return <span className={`badge badge--val-${status}`}>{VALIDATION_LABEL[status]}</span>;
}

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  return <span className={`badge badge--rev-${status}`}>{REVIEW_LABEL[status]}</span>;
}

export function BatchStatusBadge({ status }: { status: BatchStatus }) {
  return <span className={`badge badge--batch-${status}`}>{BATCH_LABEL[status]}</span>;
}
