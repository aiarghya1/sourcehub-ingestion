import { expect, test } from "@playwright/test";

/**
 * Full-stack e2e: real browser -> React UI -> Express API -> PGlite.
 * Exercises the primary workflow the exercise asks for: ingest a deliverable,
 * see summary status, review a flagged record, and resolve it.
 */
test("ingest sample, review a flagged record, and resolve it", async ({ page }) => {
  await page.goto("/");

  // Ingest the bundled sample dataset.
  await page.getByRole("button", { name: /use sample dataset/i }).click();

  // Batch summary appears with the expected split (20 rows, some invalid).
  await expect(page.getByRole("heading", { name: /sample client deliverable/i })).toBeVisible();
  await expect(page.getByText("Completed with Issues").first()).toBeVisible();
  await expect(page.getByText("Total")).toBeVisible();

  // The records table renders rows.
  const table = page.getByRole("table");
  await expect(table).toBeVisible();
  await expect(table.getByText("Delta Logistics", { exact: true })).toBeVisible();

  // Filter to invalid records only.
  await page.locator("select").first().selectOption("invalid");
  await expect(table.getByText("Golden Gate Textiles")).toBeVisible();

  // Open a flagged record and confirm its issue detail is shown.
  await table.getByText("Golden Gate Textiles").click();
  const drawer = page.locator(".drawer");
  await expect(drawer.getByText(/gross sales cannot be negative/i)).toBeVisible();

  // Resolve it and confirm the review badge updates.
  await drawer.getByRole("button", { name: /mark resolved/i }).click();
  await expect(drawer.getByText("Resolved", { exact: true })).toBeVisible();
});

test("empty upload surfaces a clear failure", async ({ page, request }) => {
  // Drive the failure path via the API the UI uses, then confirm the batch is recorded failed.
  const res = await request.post("/api/batches", {
    data: { sourceLabel: "Empty e2e", format: "csv", content: "   " },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error.code).toBe("ingestion_failed");
  expect(body.batch.status).toBe("failed");
});
