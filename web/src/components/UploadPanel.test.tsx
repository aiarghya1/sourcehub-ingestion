import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/api", () => {
  class ApiError extends Error {
    constructor(public status: number, message: string, public body?: unknown) {
      super(message);
    }
  }
  return { ApiError, api: { ingest: vi.fn(), ingestSample: vi.fn() } };
});

import { UploadPanel } from "./UploadPanel";
import { api, ApiError } from "../lib/api";
import type { Batch } from "../lib/types";

const mockApi = vi.mocked(api);

const failedBatch: Batch = {
  id: "bad", sourceLabel: "Empty upload", sourceFilename: null, status: "failed",
  totals: { total: 0, valid: 0, warning: 0, invalid: 0 },
  errorMessage: "The dataset is empty.", createdAt: "", updatedAt: "",
};

beforeEach(() => vi.clearAllMocks());

describe("UploadPanel", () => {
  it("on a failed ingestion, shows the error AND surfaces the failed batch for refresh", async () => {
    mockApi.ingestSample.mockRejectedValue(
      new ApiError(400, "The dataset is empty.", { error: { code: "ingestion_failed" }, batch: failedBatch }),
    );
    const onIngested = vi.fn();
    render(<UploadPanel onIngested={onIngested} />);

    await userEvent.click(screen.getByRole("button", { name: /use sample dataset/i }));

    await waitFor(() => expect(screen.getByText("The dataset is empty.")).toBeInTheDocument());
    // The failed batch is pushed up so the batch history can refresh without a page reload.
    expect(onIngested).toHaveBeenCalledWith(failedBatch);
  });

  it("on a successful ingestion, reports the new batch", async () => {
    const ok: Batch = { ...failedBatch, id: "ok", status: "completed" };
    mockApi.ingestSample.mockResolvedValue(ok);
    const onIngested = vi.fn();
    render(<UploadPanel onIngested={onIngested} />);
    await userEvent.click(screen.getByRole("button", { name: /use sample dataset/i }));
    await waitFor(() => expect(onIngested).toHaveBeenCalledWith(ok));
  });
});
