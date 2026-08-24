import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the API layer so the App test is deterministic and offline.
vi.mock("./lib/api", () => {
  class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  }
  return {
    ApiError,
    api: {
      listBatches: vi.fn(),
      listRecords: vi.fn(),
      updateReview: vi.fn(),
      ingest: vi.fn(),
      ingestSample: vi.fn(),
    },
  };
});

import { App } from "./App";
import { api } from "./lib/api";
import type { Batch, Record } from "./lib/types";

const batch: Batch = {
  id: "b1",
  sourceLabel: "Q1 deliverable",
  sourceFilename: "sample.csv",
  status: "completed_with_issues",
  totals: { total: 2, valid: 1, warning: 0, invalid: 1 },
  errorMessage: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const invalidRecord: Record = {
  id: "r1", batchId: "b1", rowNumber: 4, sourceRowId: "4",
  raw: { client_name: "Delta", state: "ZZ" },
  normalized: {
    sourceRowId: "4", clientName: "Delta", entityName: "Delta LLC", state: "ZZ",
    jurisdictionType: "State", taxYear: 2025, periodStart: "2025-01-01", periodEnd: "2025-03-31",
    grossSales: 50000, transactionCount: 88, filingFrequency: "Quarterly", nexusIndicator: true, notes: null,
  },
  validationStatus: "invalid", reviewStatus: "needs_review", errorCount: 1, warningCount: 0,
  reviewNote: null, reviewedAt: null, createdAt: "", updatedAt: "",
  issues: [{ id: "i1", field: "state", issueType: "invalid_state", severity: "error", message: '"ZZ" is not a valid US state/territory abbreviation.' }],
};

const mockApi = vi.mocked(api);

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.listBatches.mockResolvedValue([batch]);
  mockApi.listRecords.mockResolvedValue({ records: [invalidRecord], pagination: { total: 1, limit: 200, offset: 0 } });
});

describe("App", () => {
  it("loads batches, auto-selects one, and shows summary counts + records", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Q1 deliverable" })).toBeInTheDocument();
    // summary tiles
    expect(screen.getByText("Total")).toBeInTheDocument();
    // record row rendered, flagged invalid (scope to the table to avoid the summary tile)
    expect(await screen.findByText("Delta")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Invalid")).toBeInTheDocument();
  });

  it("filters records by validation status", async () => {
    render(<App />);
    await screen.findByText("Delta");
    const validationSelect = screen.getAllByRole("combobox")[0]!;
    await userEvent.selectOptions(validationSelect, "invalid");
    await waitFor(() =>
      expect(mockApi.listRecords).toHaveBeenLastCalledWith("b1", expect.objectContaining({ validationStatus: "invalid" })),
    );
  });

  it("opens the detail drawer and resolves a record", async () => {
    mockApi.updateReview.mockResolvedValue({ ...invalidRecord, reviewStatus: "resolved", reviewedAt: new Date().toISOString() });
    render(<App />);
    await userEvent.click(await screen.findByText("Delta"));

    // drawer shows the issue detail (locate the drawer via its "Row 4" heading)
    const drawer = screen.getByText("Row 4").closest("aside")!;
    expect(within(drawer).getByText(/not a valid US state/i)).toBeInTheDocument();

    await userEvent.click(within(drawer).getByRole("button", { name: /mark resolved/i }));
    expect(mockApi.updateReview).toHaveBeenCalledWith("r1", "resolved", expect.anything());
    await waitFor(() => expect(within(drawer).getByText("Resolved")).toBeInTheDocument());
  });

  it("shows an error with retry when batches fail to load", async () => {
    const { ApiError } = await import("./lib/api");
    mockApi.listBatches.mockRejectedValueOnce(new ApiError(500, "boom"));
    render(<App />);
    expect(await screen.findByText("boom")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
