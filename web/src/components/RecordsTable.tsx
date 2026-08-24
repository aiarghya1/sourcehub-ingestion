import type { Record } from "../lib/types";
import { ReviewBadge, ValidationBadge } from "./badges";

interface Props {
  records: Record[];
  selectedId: string | null;
  onSelect: (record: Record) => void;
}

function cell(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

export function RecordsTable({ records, selectedId, onSelect }: Props) {
  if (records.length === 0) {
    return <p className="muted" style={{ padding: "1rem" }}>No records match the current filters.</p>;
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Row</th>
            <th>Source ID</th>
            <th>Client</th>
            <th>Entity</th>
            <th>State</th>
            <th className="num">Gross Sales</th>
            <th className="num">Txns</th>
            <th>Validation</th>
            <th>Review</th>
            <th className="num">Issues</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const n = r.normalized;
            const issueCount = r.errorCount + r.warningCount;
            return (
              <tr
                key={r.id}
                className={`${r.id === selectedId ? "row--active" : ""} ${
                  r.validationStatus !== "valid" ? "row--flagged" : ""
                }`}
                onClick={() => onSelect(r)}
              >
                <td>{r.rowNumber}</td>
                <td>{cell(r.sourceRowId)}</td>
                <td>{cell(n?.clientName ?? r.raw.client_name)}</td>
                <td>{cell(n?.entityName ?? r.raw.entity_name)}</td>
                <td>{cell(n?.state ?? r.raw.state)}</td>
                <td className="num">{n?.grossSales != null ? n.grossSales.toLocaleString() : cell(r.raw.gross_sales)}</td>
                <td className="num">{cell(n?.transactionCount ?? r.raw.transaction_count)}</td>
                <td><ValidationBadge status={r.validationStatus} /></td>
                <td><ReviewBadge status={r.reviewStatus} /></td>
                <td className="num">{issueCount > 0 ? issueCount : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
