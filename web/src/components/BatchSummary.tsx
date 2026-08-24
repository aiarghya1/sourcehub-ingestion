import type { Batch } from "../lib/types";
import { BatchStatusBadge } from "./badges";

export function BatchSummary({ batch }: { batch: Batch }) {
  const { totals } = batch;
  return (
    <div className="summary">
      <div className="summary__head">
        <div>
          <h2 className="summary__title">{batch.sourceLabel}</h2>
          <p className="small muted">
            {batch.sourceFilename ?? "—"} · ingested {new Date(batch.createdAt).toLocaleString()}
          </p>
        </div>
        <BatchStatusBadge status={batch.status} />
      </div>
      <div className="stats">
        <Stat label="Total" value={totals.total} tone="total" />
        <Stat label="Valid" value={totals.valid} tone="valid" />
        <Stat label="Warnings" value={totals.warning} tone="warning" />
        <Stat label="Invalid" value={totals.invalid} tone="invalid" />
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`stat stat--${tone}`}>
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
    </div>
  );
}
