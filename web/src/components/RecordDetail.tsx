import { useEffect, useState } from "react";
import type { Record, ReviewStatus } from "../lib/types";
import { ReviewBadge, ValidationBadge } from "./badges";

interface Props {
  record: Record;
  busy: boolean;
  onReview: (status: ReviewStatus, note?: string) => void;
  onClose: () => void;
}

const NORMALIZED_FIELDS: [keyof NonNullable<Record["normalized"]>, string][] = [
  ["sourceRowId", "Source Row ID"],
  ["clientName", "Client"],
  ["entityName", "Entity"],
  ["state", "State"],
  ["jurisdictionType", "Jurisdiction"],
  ["taxYear", "Tax Year"],
  ["periodStart", "Period Start"],
  ["periodEnd", "Period End"],
  ["grossSales", "Gross Sales"],
  ["transactionCount", "Transactions"],
  ["filingFrequency", "Filing Frequency"],
  ["nexusIndicator", "Nexus"],
];

export function RecordDetail({ record, busy, onReview, onClose }: Props) {
  const [note, setNote] = useState(record.reviewNote ?? "");
  useEffect(() => setNote(record.reviewNote ?? ""), [record.id, record.reviewNote]);

  const issues = record.issues ?? [];

  return (
    <aside className="drawer">
      <div className="drawer__head">
        <div>
          <h3>Row {record.rowNumber}</h3>
          <div className="drawer__badges">
            <ValidationBadge status={record.validationStatus} />
            <ReviewBadge status={record.reviewStatus} />
          </div>
        </div>
        <button className="btn btn--icon" onClick={onClose} aria-label="Close">×</button>
      </div>

      <section className="drawer__section">
        <h4>Validation issues ({issues.length})</h4>
        {issues.length === 0 ? (
          <p className="muted small">No issues — this record passed all rules.</p>
        ) : (
          <ul className="issues">
            {issues.map((i) => (
              <li key={i.id} className={`issue issue--${i.severity}`}>
                <div className="issue__top">
                  <span className={`sev sev--${i.severity}`}>{i.severity}</span>
                  {i.field && <code className="issue__field">{i.field}</code>}
                  <span className="issue__type small muted">{i.issueType}</span>
                </div>
                <div className="issue__msg">{i.message}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="drawer__section">
        <h4>Normalized values</h4>
        <dl className="kv">
          {NORMALIZED_FIELDS.map(([key, label]) => {
            const v = record.normalized?.[key];
            const display =
              v === null || v === undefined ? "—" : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
            return (
              <div className="kv__row" key={key}>
                <dt>{label}</dt>
                <dd>{display}</dd>
              </div>
            );
          })}
        </dl>
      </section>

      <section className="drawer__section">
        <h4>Original row</h4>
        <pre className="raw">{JSON.stringify(record.raw, null, 2)}</pre>
      </section>

      <section className="drawer__section drawer__review">
        <h4>Review</h4>
        <textarea
          className="input textarea"
          placeholder="Resolution note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
        />
        <div className="drawer__actions">
          <button
            className="btn"
            disabled={busy || record.reviewStatus === "needs_review"}
            onClick={() => onReview("needs_review", note)}
          >
            Needs Review
          </button>
          <button
            className="btn"
            disabled={busy || record.reviewStatus === "reviewed"}
            onClick={() => onReview("reviewed", note)}
          >
            Mark Reviewed
          </button>
          <button
            className="btn btn--primary"
            disabled={busy || record.reviewStatus === "resolved"}
            onClick={() => onReview("resolved", note)}
          >
            Mark Resolved
          </button>
        </div>
      </section>
    </aside>
  );
}
