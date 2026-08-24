import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { readFileSync } from "node:fs";
import { createApp } from "../src/http/server.js";
import { freshDb } from "./helpers.js";

let server: Server;
let base: string;

beforeAll(async () => {
  const db = await freshDb();
  const app = createApp(db);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  base = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const sample = readFileSync(new URL("../data/sample.csv", import.meta.url), "utf8");

async function post(path: string, body: unknown) {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

describe("ingestion API", () => {
  let batchId: string;

  it("ingests the sample CSV and reports mixed status with counts", async () => {
    const { status, json } = await post("/api/batches", {
      sourceLabel: "Test batch",
      filename: "sample.csv",
      format: "csv",
      content: sample,
    });
    expect(status).toBe(201);
    expect(json.batch.status).toBe("completed_with_issues");
    expect(json.batch.totals.total).toBe(20);
    expect(json.batch.totals.valid).toBeGreaterThan(0);
    expect(json.batch.totals.invalid).toBeGreaterThan(0);
    batchId = json.batch.id;
  });

  it("lists batches", async () => {
    const res = await fetch(`${base}/api/batches`);
    const json = await res.json();
    expect(json.batches.some((b: { id: string }) => b.id === batchId)).toBe(true);
  });

  it("returns records with embedded issues and supports filtering", async () => {
    const res = await fetch(`${base}/api/batches/${batchId}/records?validationStatus=invalid`);
    const json = await res.json();
    expect(json.records.length).toBeGreaterThan(0);
    for (const rec of json.records) {
      expect(rec.validationStatus).toBe("invalid");
      expect(rec.errorCount).toBeGreaterThan(0);
    }
  });

  it("returns all validation issues for a batch", async () => {
    const res = await fetch(`${base}/api/batches/${batchId}/issues`);
    const json = await res.json();
    expect(Array.isArray(json.issues)).toBe(true);
    expect(json.issues.length).toBeGreaterThan(0);
    expect(json.issues[0]).toHaveProperty("recordId");
    expect(json.issues[0]).toHaveProperty("severity");
  });

  it("updates review status and persists it", async () => {
    const list = await (await fetch(`${base}/api/batches/${batchId}/records?validationStatus=invalid&limit=1`)).json();
    const recordId = list.records[0].id;
    const patch = await fetch(`${base}/api/records/${recordId}/review`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reviewStatus: "resolved", note: "Confirmed with client" }),
    });
    const json = await patch.json();
    expect(patch.status).toBe(200);
    expect(json.record.reviewStatus).toBe("resolved");
    expect(json.record.reviewNote).toBe("Confirmed with client");
    expect(json.record.reviewedAt).not.toBeNull();
  });

  it("records an empty upload as a FAILED batch and returns 400", async () => {
    const { status, json } = await post("/api/batches", {
      sourceLabel: "Empty upload",
      format: "csv",
      content: "   ",
    });
    expect(status).toBe(400);
    expect(json.error.code).toBe("ingestion_failed");
    expect(json.batch.status).toBe("failed");
  });

  it("404s for an unknown batch", async () => {
    const res = await fetch(`${base}/api/batches/does-not-exist`);
    expect(res.status).toBe(404);
  });

  it("ingests a large dataset via bulk insert with correct counts", async () => {
    const header =
      "source_row_id,client_name,entity_name,state,jurisdiction_type,tax_year,period_start,period_end,gross_sales,transaction_count,filing_frequency,nexus_indicator,notes";
    const lines: string[] = [header];
    for (let i = 1; i <= 3000; i++) {
      lines.push(`${i},Client ${i},Entity ${i},CO,State,2025,2025-01-01,2025-03-31,1000.00,10,Quarterly,Yes,`);
    }
    const { status, json } = await post("/api/batches", {
      sourceLabel: "Bulk",
      format: "csv",
      content: lines.join("\n"),
    });
    expect(status).toBe(201);
    expect(json.batch.totals.total).toBe(3000);
    expect(json.batch.totals.valid).toBe(3000);
  });
});
