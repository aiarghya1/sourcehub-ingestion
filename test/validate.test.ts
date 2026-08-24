import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/ingestion/parse.js";
import { validateRow, validateRows } from "../src/validation/validate.js";
import { IssueType, ValidationStatus } from "../src/domain/types.js";

const HEADER =
  "source_row_id,client_name,entity_name,state,jurisdiction_type,tax_year,period_start,period_end,gross_sales,transaction_count,filing_frequency,nexus_indicator,notes";

function rowOf(line: string) {
  return parseCsv(`${HEADER}\n${line}`).rows[0]!;
}

function typesOf(line: string) {
  return validateRow(rowOf(line)).issues.map((i) => i.issueType);
}

describe("validateRow", () => {
  it("accepts a clean row and normalizes fields", () => {
    const v = validateRow(rowOf("1,Acme,Acme West LLC,co,State,2025,2025-01-01,2025-03-31,125000.50,342,quarterly,Yes,ok"));
    expect(v.validationStatus).toBe(ValidationStatus.Valid);
    expect(v.issues).toHaveLength(0);
    expect(v.normalized).toMatchObject({
      state: "CO",
      grossSales: 125000.5,
      transactionCount: 342,
      filingFrequency: "Quarterly",
      nexusIndicator: true,
    });
  });

  it("flags an invalid state as an error", () => {
    expect(typesOf("1,Acme,E,ZZ,State,2025,2025-01-01,2025-03-31,1,1,Monthly,Yes,")).toContain(
      IssueType.InvalidState,
    );
  });

  it("flags an invalid calendar date", () => {
    expect(typesOf("1,Acme,E,CO,State,2025,2025-13-40,2025-03-31,1,1,Monthly,Yes,")).toContain(
      IssueType.InvalidDate,
    );
  });

  it("flags period end before start", () => {
    expect(typesOf("1,Acme,E,CO,State,2025,2025-06-30,2025-01-01,1,1,Monthly,Yes,")).toContain(
      IssueType.PeriodOrder,
    );
  });

  it("flags negative gross sales and non-numeric transaction count", () => {
    const types = typesOf("1,Acme,E,CO,State,2025,2025-01-01,2025-03-31,-5,many,Monthly,Yes,");
    expect(types).toContain(IssueType.NegativeValue);
    expect(types).toContain(IssueType.NonNumeric);
  });

  it("treats missing required fields as errors", () => {
    const types = typesOf(",,E,CO,State,2025,2025-01-01,2025-03-31,1,1,Monthly,Yes,");
    expect(types.filter((t) => t === IssueType.RequiredFieldMissing).length).toBeGreaterThanOrEqual(2);
  });

  it("treats blank entity name, unknown frequency, and ambiguous nexus as warnings", () => {
    const v = validateRow(rowOf("1,Acme,,CO,State,2025,2025-01-01,2025-03-31,1,1,Fortnightly,Maybe,"));
    expect(v.validationStatus).toBe(ValidationStatus.Warning);
    const types = v.issues.map((i) => i.issueType);
    expect(types).toContain(IssueType.BlankEntityName);
    expect(types).toContain(IssueType.UnknownEnum);
    expect(types).toContain(IssueType.AmbiguousValue);
  });

  it("marks a malformed row and skips field-level rules", () => {
    const csv = `${HEADER}\n1,Acme,E,CO\n`;
    const v = validateRow(parseCsv(csv).rows[0]!);
    expect(v.validationStatus).toBe(ValidationStatus.Invalid);
    expect(v.issues.map((i) => i.issueType)).toEqual([IssueType.MalformedRow]);
  });
});

describe("validateRows (cross-row)", () => {
  it("flags duplicate source_row_id across the batch", () => {
    const csv = `${HEADER}
7,A,A LLC,CO,State,2025,2025-01-01,2025-03-31,1,1,Monthly,Yes,
7,B,B LLC,TX,State,2025,2025-01-01,2025-03-31,1,1,Monthly,Yes,`;
    const results = validateRows(parseCsv(csv).rows);
    for (const r of results) {
      expect(r.issues.map((i) => i.issueType)).toContain(IssueType.DuplicateSourceRowId);
      expect(r.validationStatus).toBe(ValidationStatus.Invalid);
    }
  });
});
