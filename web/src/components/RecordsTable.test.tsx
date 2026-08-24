import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RecordsTable } from "./RecordsTable";
import type { Record } from "../lib/types";

function makeRecord(over: Partial<Record> = {}): Record {
  return {
    id: over.id ?? "r1",
    batchId: "b1",
    rowNumber: over.rowNumber ?? 1,
    sourceRowId: "1",
    raw: { client_name: "Acme", entity_name: "Acme LLC", state: "CO", gross_sales: "100", transaction_count: "5" },
    normalized: {
      sourceRowId: "1", clientName: "Acme", entityName: "Acme LLC", state: "CO",
      jurisdictionType: "State", taxYear: 2025, periodStart: "2025-01-01", periodEnd: "2025-03-31",
      grossSales: 100, transactionCount: 5, filingFrequency: "Quarterly", nexusIndicator: true, notes: null,
    },
    validationStatus: "valid",
    reviewStatus: "reviewed",
    errorCount: 0,
    warningCount: 0,
    reviewNote: null,
    reviewedAt: null,
    createdAt: "", updatedAt: "",
    ...over,
  };
}

describe("RecordsTable", () => {
  it("shows an empty message when there are no records", () => {
    render(<RecordsTable records={[]} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText(/no records match/i)).toBeInTheDocument();
  });

  it("flags invalid rows and surfaces the issue count", () => {
    const invalid = makeRecord({ id: "r2", rowNumber: 7, validationStatus: "invalid", errorCount: 3 });
    const { container } = render(<RecordsTable records={[invalid]} selectedId={null} onSelect={() => {}} />);
    expect(container.querySelector("tr.row--flagged")).not.toBeNull();
    expect(screen.getByText("Invalid")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument(); // issue count cell (errorCount + warningCount)
  });

  it("calls onSelect with the clicked record", async () => {
    const onSelect = vi.fn();
    const rec = makeRecord();
    render(<RecordsTable records={[rec]} selectedId={null} onSelect={onSelect} />);
    await userEvent.click(screen.getByText("Acme"));
    expect(onSelect).toHaveBeenCalledWith(rec);
  });
});
