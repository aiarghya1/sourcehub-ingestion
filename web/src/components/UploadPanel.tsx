import { useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { Batch } from "../lib/types";

interface Props {
  onIngested: (batch: Batch) => void;
}

/** Reads a chosen file entirely in the browser and posts its text to the API. */
export function UploadPanel({ onIngested }: Props) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function ingestFile() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a CSV or JSON file first.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const content = await file.text();
      const format = file.name.toLowerCase().endsWith(".json") ? "json" : "csv";
      const batch = await api.ingest({
        sourceLabel: label.trim() || file.name,
        filename: file.name,
        format,
        content,
      });
      onIngested(batch);
      setLabel("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      // A parse-level failure (400) still creates a FAILED batch; surface both.
      setError(e instanceof ApiError ? e.message : "Ingestion failed.");
    } finally {
      setBusy(false);
    }
  }

  async function ingestSample() {
    setError(null);
    setBusy(true);
    try {
      onIngested(await api.ingestSample(label.trim() || "Sample client deliverable"));
      setLabel("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Ingestion failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="upload">
      <input
        className="input"
        placeholder="Batch label (optional)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        disabled={busy}
      />
      <input ref={fileRef} className="input" type="file" accept=".csv,.json" disabled={busy} />
      <div className="upload__actions">
        <button className="btn btn--primary" onClick={ingestFile} disabled={busy}>
          {busy ? "Ingesting…" : "Ingest file"}
        </button>
        <button className="btn" onClick={ingestSample} disabled={busy}>
          Use sample dataset
        </button>
      </div>
      {error && <p className="error-text small">{error}</p>}
    </div>
  );
}
