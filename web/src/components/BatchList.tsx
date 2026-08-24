import type { Batch } from "../lib/types";
import { BatchStatusBadge } from "./badges";

interface Props {
  batches: Batch[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function BatchList({ batches, selectedId, onSelect }: Props) {
  if (batches.length === 0) {
    return <p className="muted small">No batches yet. Ingest a dataset to get started.</p>;
  }
  return (
    <ul className="batch-list">
      {batches.map((b) => (
        <li key={b.id}>
          <button
            className={`batch-card ${b.id === selectedId ? "batch-card--active" : ""}`}
            onClick={() => onSelect(b.id)}
          >
            <div className="batch-card__top">
              <span className="batch-card__label">{b.sourceLabel}</span>
              <BatchStatusBadge status={b.status} />
            </div>
            <div className="batch-card__meta small muted">
              {b.sourceFilename ?? "—"} · {new Date(b.createdAt).toLocaleString()}
            </div>
            {b.status === "failed" ? (
              <div className="small error-text">{b.errorMessage}</div>
            ) : (
              <div className="batch-card__counts small">
                <span>{b.totals.total} rows</span>
                <span className="dot valid" /> {b.totals.valid}
                <span className="dot warning" /> {b.totals.warning}
                <span className="dot invalid" /> {b.totals.invalid}
              </div>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
