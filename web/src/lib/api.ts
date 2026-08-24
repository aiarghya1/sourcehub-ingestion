import type { Batch, Pagination, Record, ReviewStatus, ValidationStatus } from "./types";

/** Thin typed fetch wrapper with a consistent error surface. */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Is the API running?");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body?.error?.message ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return body as T;
}

export const api = {
  listBatches: () => request<{ batches: Batch[] }>("/api/batches").then((r) => r.batches),

  ingest: (input: { sourceLabel: string; filename?: string; format: "csv" | "json"; content: string }) =>
    request<{ batch: Batch }>("/api/batches", { method: "POST", body: JSON.stringify(input) }).then(
      (r) => r.batch,
    ),

  ingestSample: (sourceLabel = "Sample client deliverable") =>
    request<{ batch: Batch }>("/api/batches", {
      method: "POST",
      body: JSON.stringify({ sourceLabel, useSample: true }),
    }).then((r) => r.batch),

  listRecords: (
    batchId: string,
    filters: { validationStatus?: ValidationStatus; reviewStatus?: ReviewStatus; limit?: number; offset?: number },
  ) => {
    const q = new URLSearchParams();
    if (filters.validationStatus) q.set("validationStatus", filters.validationStatus);
    if (filters.reviewStatus) q.set("reviewStatus", filters.reviewStatus);
    q.set("limit", String(filters.limit ?? 200));
    q.set("offset", String(filters.offset ?? 0));
    return request<{ records: Record[]; pagination: Pagination }>(
      `/api/batches/${batchId}/records?${q.toString()}`,
    );
  },

  updateReview: (recordId: string, reviewStatus: ReviewStatus, note?: string) =>
    request<{ record: Record }>(`/api/records/${recordId}/review`, {
      method: "PATCH",
      body: JSON.stringify({ reviewStatus, note }),
    }).then((r) => r.record),
};
