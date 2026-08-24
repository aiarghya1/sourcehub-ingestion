import { RawRecord } from "../domain/types.js";

export interface ParsedRow {
  rowNumber: number; // 1-based data row index (header is not counted)
  cells: string[]; // every original cell, untrimmed, exactly as tokenized
  raw: RawRecord; // header -> value; extra cells preserved under column_N keys
  /** True when the row cannot be aligned to the header (bad column count / bad quoting). */
  malformed: boolean;
  /** Why the row is malformed, for a precise validation message. */
  malformedReason?: string;
}

export interface ParseResult {
  header: string[];
  rows: ParsedRow[];
}

export class EmptyDatasetError extends Error {}
export class InvalidFormatError extends Error {}

/** Header keys that could pollute Object.prototype if used as plain-object keys. */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const safeKey = (key: string): string => (UNSAFE_KEYS.has(key) ? `_${key}` : key);

/**
 * RFC4180-ish CSV tokenizer. Handles quoted fields, escaped quotes (""),
 * embedded commas, and CRLF/LF line endings. Returns rows as raw string arrays
 * so downstream validation can decide what to do with imperfect data rather
 * than the parser silently dropping it.
 */
function tokenize(input: string): { rows: string[][]; unterminatedQuote: boolean } {
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
  if (!sawAny) return { rows: [], unterminatedQuote: false };
  // If we ended while still inside a quote, the last row swallowed the rest of
  // the file (commas/newlines became literal): it cannot be trusted as aligned.
  return { rows, unterminatedQuote: inQuotes };
}

/** Parse CSV text into a header plus aligned data rows. */
export function parseCsv(text: string): ParseResult {
  const raw = text.replace(/^﻿/, ""); // strip BOM
  if (raw.trim() === "") throw new EmptyDatasetError("The dataset is empty.");

  const { rows: tokenized, unterminatedQuote } = tokenize(raw);
  const table = tokenized.filter(
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
    // Store values untrimmed so `raw` is the parsed original; the validation
    // layer trims at point of use. Extra cells beyond the header are preserved
    // under column_N keys so no data from a malformed row is lost.
    const rawObj: RawRecord = {};
    header.forEach((key, i) => {
      rawObj[safeKey(key)] = cells[i] ?? "";
    });
    for (let i = header.length; i < cells.length; i++) {
      rawObj[`column_${i + 1}`] = cells[i] ?? "";
    }
    const row: ParsedRow = { rowNumber: idx + 1, cells, raw: rawObj, malformed };
    if (malformed) {
      row.malformedReason = `has ${cells.length} columns but the header defines ${header.length}`;
    }
    return row;
  });

  if (rows.length === 0) throw new EmptyDatasetError("The dataset has a header but no data rows.");

  // An unterminated quoted field corrupts the final row's boundaries: flag it
  // malformed so its data is preserved and surfaced rather than silently trusted.
  if (unterminatedQuote && rows.length > 0) {
    const last = rows[rows.length - 1]!;
    last.malformed = true;
    last.malformedReason = "contains an unterminated quoted field (missing closing quote)";
  }

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
        rawObj[safeKey(key)] = val == null ? "" : String(val);
      }
    }
    return { rowNumber: idx + 1, cells: Object.values(rawObj), raw: rawObj, malformed };
  });
  return { header, rows };
}

export function parseDataset(text: string, format: "csv" | "json"): ParseResult {
  return format === "json" ? parseJson(text) : parseCsv(text);
}
