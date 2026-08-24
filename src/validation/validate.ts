import {
  IssueType,
  NormalizedRecord,
  Severity,
  ValidationIssue,
  ValidationStatus,
} from "../domain/types.js";
import { ParsedRow } from "../ingestion/parse.js";
import { FILING_FREQUENCIES, parseNexus, US_STATES } from "./states.js";

export interface RowValidation {
  normalized: NormalizedRecord | null;
  issues: ValidationIssue[];
  validationStatus: ValidationStatus;
  errorCount: number;
  warningCount: number;
}

const REQUIRED_FIELDS = [
  "source_row_id",
  "client_name",
  "state",
  "tax_year",
  "period_start",
  "period_end",
  "gross_sales",
  "transaction_count",
] as const;

/** Case-insensitive, whitespace-tolerant accessor over the raw row. */
function field(raw: Record<string, string>, name: string): string {
  if (raw[name] != null) return raw[name]!;
  const key = Object.keys(raw).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? raw[key]! : "";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True only for a syntactically-correct AND calendar-real YYYY-MM-DD date. */
function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m! < 1 || m! > 12 || d! < 1 || d! > 31) return false;
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m! - 1 && dt.getUTCDate() === d;
}

/**
 * Validate and normalize a single parsed row.
 * Row-level structural problems (malformed) short-circuit; otherwise every rule
 * runs so the analyst sees the full set of issues on a record at once.
 */
export function validateRow(row: ParsedRow): RowValidation {
  const issues: ValidationIssue[] = [];
  const add = (
    fieldName: string | null,
    issueType: IssueType,
    severity: Severity,
    message: string,
  ) => issues.push({ field: fieldName, issueType, severity, message });

  if (row.malformed) {
    const reason = row.malformedReason ?? "cannot be aligned to the header";
    add(
      null,
      IssueType.MalformedRow,
      Severity.Error,
      `Malformed row: ${reason}. Fields cannot be aligned reliably; original cells are preserved.`,
    );
    return finalize(null, issues);
  }

  const raw = row.raw;

  // --- Required fields -----------------------------------------------------
  for (const f of REQUIRED_FIELDS) {
    if (field(raw, f).trim() === "") {
      add(f, IssueType.RequiredFieldMissing, Severity.Error, `Required field "${f}" is missing.`);
    }
  }

  // --- entity_name: blank is a warning, not a hard error -------------------
  const entityName = field(raw, "entity_name").trim();
  if (entityName === "") {
    add("entity_name", IssueType.BlankEntityName, Severity.Warning, "Entity name is blank.");
  }

  // --- State ---------------------------------------------------------------
  const stateRaw = field(raw, "state").trim();
  const state = stateRaw.toUpperCase();
  if (stateRaw !== "" && !US_STATES.has(state)) {
    add("state", IssueType.InvalidState, Severity.Error, `"${stateRaw}" is not a valid US state/territory abbreviation.`);
  }

  // --- Tax year ------------------------------------------------------------
  const taxYearRaw = field(raw, "tax_year").trim();
  let taxYear: number | null = null;
  if (taxYearRaw !== "") {
    const n = Number(taxYearRaw);
    if (!Number.isInteger(n)) {
      add("tax_year", IssueType.NonNumeric, Severity.Error, `Tax year "${taxYearRaw}" is not a valid integer year.`);
    } else if (n < 2000 || n > 2100) {
      taxYear = n;
      add("tax_year", IssueType.OutOfRange, Severity.Warning, `Tax year ${n} is outside the expected 2000–2100 range.`);
    } else {
      taxYear = n;
    }
  }

  // --- Dates ---------------------------------------------------------------
  const periodStartRaw = field(raw, "period_start").trim();
  const periodEndRaw = field(raw, "period_end").trim();
  const startOk = periodStartRaw !== "" && isValidIsoDate(periodStartRaw);
  const endOk = periodEndRaw !== "" && isValidIsoDate(periodEndRaw);
  if (periodStartRaw !== "" && !startOk) {
    add("period_start", IssueType.InvalidDate, Severity.Error, `Period start "${periodStartRaw}" is not a valid YYYY-MM-DD date.`);
  }
  if (periodEndRaw !== "" && !endOk) {
    add("period_end", IssueType.InvalidDate, Severity.Error, `Period end "${periodEndRaw}" is not a valid YYYY-MM-DD date.`);
  }
  if (startOk && endOk && periodStartRaw > periodEndRaw) {
    add("period_end", IssueType.PeriodOrder, Severity.Error, `Period end (${periodEndRaw}) is before period start (${periodStartRaw}).`);
  }

  // --- Gross sales ---------------------------------------------------------
  const grossRaw = field(raw, "gross_sales").trim();
  let grossSales: number | null = null;
  if (grossRaw !== "") {
    const n = Number(grossRaw);
    if (!Number.isFinite(n)) {
      add("gross_sales", IssueType.NonNumeric, Severity.Error, `Gross sales "${grossRaw}" is not a number.`);
    } else if (n < 0) {
      grossSales = n;
      add("gross_sales", IssueType.NegativeValue, Severity.Error, `Gross sales cannot be negative (${n}).`);
    } else {
      grossSales = n;
    }
  }

  // --- Transaction count ---------------------------------------------------
  const txnRaw = field(raw, "transaction_count").trim();
  let transactionCount: number | null = null;
  if (txnRaw !== "") {
    const n = Number(txnRaw);
    if (!Number.isInteger(n)) {
      add("transaction_count", IssueType.NonNumeric, Severity.Error, `Transaction count "${txnRaw}" is not a whole number.`);
    } else if (n < 0) {
      transactionCount = n;
      add("transaction_count", IssueType.NegativeValue, Severity.Error, `Transaction count cannot be negative (${n}).`);
    } else {
      transactionCount = n;
    }
  }

  // --- Filing frequency (warning-level enum) -------------------------------
  const freqRaw = field(raw, "filing_frequency").trim();
  let filingFrequency: string | null = null;
  if (freqRaw !== "") {
    const canonical = FILING_FREQUENCIES[freqRaw.toLowerCase()];
    if (canonical) filingFrequency = canonical;
    else {
      filingFrequency = freqRaw;
      add("filing_frequency", IssueType.UnknownEnum, Severity.Warning, `Unknown filing frequency "${freqRaw}".`);
    }
  }

  // --- Nexus indicator (ambiguity is a warning) ----------------------------
  const nexusRaw = field(raw, "nexus_indicator").trim();
  let nexusIndicator: boolean | null = null;
  if (nexusRaw !== "") {
    const parsed = parseNexus(nexusRaw);
    if (parsed === "ambiguous") {
      add("nexus_indicator", IssueType.AmbiguousValue, Severity.Warning, `Ambiguous nexus indicator "${nexusRaw}"; expected Yes/No.`);
    } else {
      nexusIndicator = parsed;
    }
  }

  const normalized: NormalizedRecord = {
    sourceRowId: field(raw, "source_row_id").trim() || null,
    clientName: field(raw, "client_name").trim() || null,
    entityName: entityName || null,
    state: stateRaw !== "" && US_STATES.has(state) ? state : stateRaw || null,
    jurisdictionType: field(raw, "jurisdiction_type").trim() || null,
    taxYear,
    periodStart: startOk ? periodStartRaw : null,
    periodEnd: endOk ? periodEndRaw : null,
    grossSales,
    transactionCount,
    filingFrequency,
    nexusIndicator,
    notes: field(raw, "notes").trim() || null,
  };

  return finalize(normalized, issues);
}

function finalize(normalized: NormalizedRecord | null, issues: ValidationIssue[]): RowValidation {
  const errorCount = issues.filter((i) => i.severity === Severity.Error).length;
  const warningCount = issues.filter((i) => i.severity === Severity.Warning).length;
  const validationStatus =
    errorCount > 0 ? ValidationStatus.Invalid : warningCount > 0 ? ValidationStatus.Warning : ValidationStatus.Valid;
  return { normalized, issues, validationStatus, errorCount, warningCount };
}

/**
 * Validate a whole batch of rows, then layer in cross-row rules
 * (duplicate source_row_id). Returns one RowValidation per input row, aligned
 * by index. Recomputes status after the duplicate pass so counts stay correct.
 */
export function validateRows(rows: ParsedRow[]): RowValidation[] {
  const results = rows.map(validateRow);

  // Duplicate source_row_id detection across the batch.
  const seen = new Map<string, number[]>();
  rows.forEach((row, idx) => {
    if (row.malformed) return;
    const id = field(row.raw, "source_row_id").trim();
    if (id === "") return;
    const list = seen.get(id) ?? [];
    list.push(idx);
    seen.set(id, list);
  });

  for (const [id, indices] of seen) {
    if (indices.length < 2) continue;
    for (const idx of indices) {
      const r = results[idx]!;
      r.issues.push({
        field: "source_row_id",
        issueType: IssueType.DuplicateSourceRowId,
        severity: Severity.Error,
        message: `Duplicate source_row_id "${id}" appears in ${indices.length} rows (lines ${indices
          .map((i) => rows[i]!.rowNumber)
          .join(", ")}).`,
      });
      const recomputed = finalize(r.normalized, r.issues);
      results[idx] = recomputed;
    }
  }

  return results;
}
