import { RawRecord } from "../domain/types.js";

export interface ParsedRow {
  rowNumber: number; // 1-based data row index (header is not counted)
  cells: string[];
  raw: RawRecord; // header -> cell, using best-effort alignment
  /** True when the column count does not match the header (malformed row). */
  malformed: boolean;
}

export interface ParseResult {
  header: string[];
  rows: ParsedRow[];
}

export class EmptyDatasetError extends Error {}
export class InvalidFormatError extends Error {}

/**
 * RFC4180-ish CSV tokenizer. Handles quoted fields, escaped quotes (""),
 * embedded commas, and CRLF/LF line endings. Returns rows as raw string arrays
 * so downstream validation can decide what to do with imperfect data rather
 * than the parser silently dropping it.
 */
function tokenize(input: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let sawAny = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    sawAny = true;
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++; // consume CRLF as one
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
    } else {
      field += ch;
    }
  }
  // Flush the trailing field/row if the file did not end in a newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (!sawAny) return [];
  return rows;
}

/** Parse CSV text into a header plus aligned data rows. */
export function parseCsv(text: string): ParseResult {
  const raw = text.replace(/^﻿/, ""); // strip BOM
  if (raw.trim() === "") throw new EmptyDatasetError("The dataset is empty.");

  const table = tokenize(raw).filter(
    // drop fully-blank lines (a single empty cell and nothing else)
    (r) => !(r.length === 1 && r[0]!.trim() === ""),
  );
  if (table.length === 0) throw new EmptyDatasetError("The dataset is empty.");

  const header = table[0]!.map((h) => h.trim());
  if (header.length < 2 || header.every((h) => h === "")) {
    throw new InvalidFormatError("Could not detect a valid CSV header row.");
  }

  const rows: ParsedRow[] = table.slice(1).map((cells, idx) => {
    const malformed = cells.length !== header.length;
    const rawObj: RawRecord = {};
    header.forEach((key, i) => {
      rawObj[key] = (cells[i] ?? "").trim();
    });
    return { rowNumber: idx + 1, cells, raw: rawObj, malformed };
  });

  if (rows.length === 0) throw new EmptyDatasetError("The dataset has a header but no data rows.");
  return { header, rows };
}

/**
 * Parse a JSON array of row objects into the same shape as parseCsv.
 * Keys become the header (union across rows).
 */
export function parseJson(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new InvalidFormatError("Body is not valid JSON.");
  }
  if (!Array.isArray(data)) throw new InvalidFormatError("Expected a JSON array of row objects.");
  if (data.length === 0) throw new EmptyDatasetError("The dataset is empty.");

  const headerSet = new Set<string>();
  for (const row of data) {
    if (row && typeof row === "object") Object.keys(row).forEach((k) => headerSet.add(k));
  }
  const header = [...headerSet];

  const rows: ParsedRow[] = data.map((row, idx) => {
    const malformed = !row || typeof row !== "object" || Array.isArray(row);
    const rawObj: RawRecord = {};
    if (!malformed) {
      for (const key of header) {
        const val = (row as Record<string, unknown>)[key];
        rawObj[key] = val == null ? "" : String(val).trim();
      }
    }
    return { rowNumber: idx + 1, cells: Object.values(rawObj), raw: rawObj, malformed };
  });
  return { header, rows };
}

export function parseDataset(text: string, format: "csv" | "json"): ParseResult {
  return format === "json" ? parseJson(text) : parseCsv(text);
}
