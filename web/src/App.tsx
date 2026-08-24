import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./lib/api";
import type { Batch, Record, ReviewStatus, ValidationStatus } from "./lib/types";
import { BatchList } from "./components/BatchList";
import { UploadPanel } from "./components/UploadPanel";
import { BatchSummary } from "./components/BatchSummary";
import { RecordsTable } from "./components/RecordsTable";
import { RecordDetail } from "./components/RecordDetail";

interface Filters {
  validationStatus?: ValidationStatus;
  reviewStatus?: ReviewStatus;
}

const PAGE_SIZE = 50;

export function App() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchesError, setBatchesError] = useState<string | null>(null);
  const [loadingBatches, setLoadingBatches] = useState(true);

  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [records, setRecords] = useState<Record[]>([]);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [filters, setFilters] = useState<Filters>({});
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

  const [selected, setSelected] = useState<Record | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);

  const selectedBatch = batches.find((b) => b.id === selectedBatchId) ?? null;

  const loadBatches = useCallback(async () => {
    setLoadingBatches(true);
    setBatchesError(null);
    try {
      setBatches(await api.listBatches());
    } catch (e) {
      setBatchesError(e instanceof ApiError ? e.message : "Failed to load batches.");
    } finally {
      setLoadingBatches(false);
    }
  }, []);

  const loadRecords = useCallback(async (batchId: string, f: Filters, pageOffset: number) => {
    setLoadingRecords(true);
    setRecordsError(null);
    try {
      const { records, pagination } = await api.listRecords(batchId, {
        ...f,
        limit: PAGE_SIZE,
        offset: pageOffset,
      });
      setRecords(records);
      setTotal(pagination.total);
    } catch (e) {
      setRecordsError(e instanceof ApiError ? e.message : "Failed to load records.");
      setRecords([]);
      setTotal(0);
    } finally {
      setLoadingRecords(false);
    }
  }, []);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  // Auto-select the first non-failed batch once batches load.
  useEffect(() => {
    if (!selectedBatchId && batches.length > 0) {
      const first = batches.find((b) => b.status !== "failed") ?? batches[0];
      if (first) setSelectedBatchId(first.id);
    }
  }, [batches, selectedBatchId]);

  useEffect(() => {
    if (selectedBatchId) {
      setSelected(null);
      loadRecords(selectedBatchId, filters, offset);
    }
  }, [selectedBatchId, filters, offset, loadRecords]);

  // Selecting a batch or changing filters resets to the first page.
  function selectBatch(id: string) {
    setSelectedBatchId(id);
    setOffset(0);
    setSelected(null);
  }
  function updateFilters(next: Filters) {
    setFilters(next);
    setOffset(0);
  }

  async function handleIngested(batch: Batch) {
    await loadBatches();
    if (batch.status !== "failed") {
      updateFilters({});
      setSelectedBatchId(batch.id);
    }
  }

  async function handleReview(status: ReviewStatus, note?: string) {
    if (!selected) return;
    setReviewBusy(true);
    try {
      const updated = await api.updateReview(selected.id, status, note);
      setSelected(updated);
      setRecords((prev) => prev.map((r) => (r.id === updated.id ? { ...updated, issues: r.issues } : r)));
    } catch (e) {
      setRecordsError(e instanceof ApiError ? e.message : "Failed to update review status.");
    } finally {
      setReviewBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">◆</span> SourceHub
          <span className="brand__sub">Ingestion Review</span>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <h1 className="sidebar__title">Ingestion Batches</h1>
          <UploadPanel onIngested={handleIngested} />
          <div className="sidebar__list">
            {loadingBatches ? (
              <p className="muted small">Loading…</p>
            ) : batchesError ? (
              <ErrorBox message={batchesError} onRetry={loadBatches} />
            ) : (
              <BatchList batches={batches} selectedId={selectedBatchId} onSelect={selectBatch} />
            )}
          </div>
        </aside>

        <main className="main">
          {!selectedBatch ? (
            <EmptyState />
          ) : (
            <>
              <BatchSummary batch={selectedBatch} />

              <div className="toolbar">
                <FilterSelect
                  label="Validation"
                  value={filters.validationStatus ?? ""}
                  onChange={(v) =>
                    updateFilters({ ...filters, validationStatus: (v || undefined) as ValidationStatus | undefined })
                  }
                  options={[
                    ["", "All"],
                    ["valid", "Valid"],
                    ["warning", "Warning"],
                    ["invalid", "Invalid"],
                  ]}
                />
                <FilterSelect
                  label="Review"
                  value={filters.reviewStatus ?? ""}
                  onChange={(v) =>
                    updateFilters({ ...filters, reviewStatus: (v || undefined) as ReviewStatus | undefined })
                  }
                  options={[
                    ["", "All"],
                    ["needs_review", "Needs Review"],
                    ["reviewed", "Reviewed"],
                    ["resolved", "Resolved"],
                  ]}
                />
                {(filters.validationStatus || filters.reviewStatus) && (
                  <button className="btn btn--ghost small" onClick={() => updateFilters({})}>
                    Clear filters
                  </button>
                )}
                <Pager
                  offset={offset}
                  count={records.length}
                  total={total}
                  onPrev={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                  onNext={() => setOffset((o) => o + PAGE_SIZE)}
                />
              </div>

              <div className="content">
                <div className="content__table">
                  {loadingRecords ? (
                    <p className="muted" style={{ padding: "1rem" }}>Loading records…</p>
                  ) : recordsError ? (
                    <ErrorBox message={recordsError} onRetry={() => loadRecords(selectedBatch.id, filters, offset)} />
                  ) : (
                    <RecordsTable records={records} selectedId={selected?.id ?? null} onSelect={setSelected} />
                  )}
                </div>
                {selected && (
                  <RecordDetail
                    record={selected}
                    busy={reviewBusy}
                    onReview={handleReview}
                    onClose={() => setSelected(null)}
                  />
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function Pager({
  offset,
  count,
  total,
  onPrev,
  onNext,
}: {
  offset: number;
  count: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const start = total === 0 ? 0 : offset + 1;
  const end = offset + count;
  return (
    <div className="pager">
      <span className="small muted">
        {total === 0 ? "No records" : `Showing ${start}–${end} of ${total}`}
      </span>
      <button className="btn btn--ghost small" onClick={onPrev} disabled={offset === 0}>
        ‹ Prev
      </button>
      <button className="btn btn--ghost small" onClick={onNext} disabled={end >= total}>
        Next ›
      </button>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="filter">
      <span className="filter__label small muted">{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="errorbox">
      <p className="error-text">{message}</p>
      <button className="btn small" onClick={onRetry}>Retry</button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty">
      <div className="empty__mark">◆</div>
      <h2>No batch selected</h2>
      <p className="muted">
        Ingest a client deliverable from the left panel — upload a CSV/JSON file or use the bundled sample —
        then select a batch to review its records and validation issues.
      </p>
    </div>
  );
}
