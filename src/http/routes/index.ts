import { Router } from "express";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Db } from "../../db/client.js";
import { BatchStatus, ReviewStatus, ValidationStatus } from "../../domain/types.js";
import {
  EmptyDatasetError,
  IngestInput,
  ingestDataset,
  InvalidFormatError,
} from "../../ingestion/service.js";
import {
  getBatch,
  getIssuesForRecord,
  getIssuesForRecords,
  getRecord,
  insertBatch,
  listBatches,
  listRecords,
  updateReviewStatus,
} from "../../ingestion/repository.js";
import { asyncHandler, badRequest, notFound } from "../errors.js";
import { serializeBatch, serializeIssue, serializeRecord } from "../serialize.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = join(__dirname, "..", "..", "..", "data", "sample.csv");

const ingestSchema = z.object({
  sourceLabel: z.string().trim().min(1, "sourceLabel is required").max(200),
  filename: z.string().trim().max(255).optional(),
  format: z.enum(["csv", "json"]).default("csv"),
  content: z.string().optional(),
  /** Convenience for the demo UI: ingest the bundled sample.csv. */
  useSample: z.boolean().optional(),
});

const reviewSchema = z.object({
  reviewStatus: z.enum([ReviewStatus.NeedsReview, ReviewStatus.Reviewed, ReviewStatus.Resolved]),
  note: z.string().trim().max(2000).optional(),
});

const validationStatusValues = Object.values(ValidationStatus) as [string, ...string[]];
const reviewStatusValues = Object.values(ReviewStatus) as [string, ...string[]];

export function makeRouter(db: Db): Router {
  const r = Router();

  // --- Create an ingestion batch ------------------------------------------
  r.post(
    "/batches",
    asyncHandler(async (req, res) => {
      const parsed = ingestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest("Invalid request body.", parsed.error.flatten());
      }
      const body = parsed.data;

      let input: IngestInput;
      if (body.useSample) {
        const content = await readFile(SAMPLE_PATH, "utf8");
        input = {
          sourceLabel: body.sourceLabel || "Sample client deliverable",
          sourceFilename: "sample.csv",
          format: "csv",
          content,
        };
      } else {
        if (body.content === undefined) {
          throw badRequest("Provide `content` (file contents) or set `useSample: true`.");
        }
        input = {
          sourceLabel: body.sourceLabel,
          sourceFilename: body.filename ?? null,
          format: body.format,
          content: body.content,
        };
      }

      try {
        const result = await ingestDataset(db, input);
        const batch = await getBatch(db, result.batchId);
        res.status(201).json({ batch: batch && serializeBatch(batch) });
      } catch (err) {
        // Parse-level failures still get recorded as a FAILED batch so the user
        // can see the attempt (and the reason) in the ingestion history.
        if (err instanceof EmptyDatasetError || err instanceof InvalidFormatError) {
          const failedId = await insertBatch(db, {
            sourceLabel: input.sourceLabel,
            sourceFilename: input.sourceFilename ?? null,
            status: BatchStatus.Failed,
            totals: { total: 0, valid: 0, warning: 0, invalid: 0 },
            errorMessage: err.message,
            records: [],
          });
          const batch = await getBatch(db, failedId);
          res.status(400).json({
            error: { code: "ingestion_failed", message: err.message },
            batch: batch && serializeBatch(batch),
          });
          return;
        }
        throw err;
      }
    }),
  );

  // --- List batches --------------------------------------------------------
  r.get(
    "/batches",
    asyncHandler(async (_req, res) => {
      const batches = await listBatches(db);
      res.json({ batches: batches.map(serializeBatch) });
    }),
  );

  // --- Get one batch -------------------------------------------------------
  r.get(
    "/batches/:id",
    asyncHandler(async (req, res) => {
      const batch = await getBatch(db, req.params.id!);
      if (!batch) throw notFound("Batch not found.");
      res.json({ batch: serializeBatch(batch) });
    }),
  );

  // --- List records for a batch (filter + paginate) ------------------------
  const recordQuerySchema = z.object({
    validationStatus: z.enum(validationStatusValues).optional(),
    reviewStatus: z.enum(reviewStatusValues).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
    offset: z.coerce.number().int().min(0).default(0),
  });

  r.get(
    "/batches/:id/records",
    asyncHandler(async (req, res) => {
      const batch = await getBatch(db, req.params.id!);
      if (!batch) throw notFound("Batch not found.");

      const q = recordQuerySchema.safeParse(req.query);
      if (!q.success) throw badRequest("Invalid query parameters.", q.error.flatten());

      const { records, total } = await listRecords(db, req.params.id!, {
        validationStatus: q.data.validationStatus as ValidationStatus | undefined,
        reviewStatus: q.data.reviewStatus as ReviewStatus | undefined,
        limit: q.data.limit,
        offset: q.data.offset,
      });

      const issues = await getIssuesForRecords(db, records.map((rec) => rec.id));
      const byRecord = new Map<string, typeof issues>();
      for (const issue of issues) {
        const list = byRecord.get(issue.record_id) ?? [];
        list.push(issue);
        byRecord.set(issue.record_id, list);
      }

      res.json({
        records: records.map((rec) => serializeRecord(rec, byRecord.get(rec.id) ?? [])),
        pagination: { total, limit: q.data.limit, offset: q.data.offset },
      });
    }),
  );

  // --- Get one record with its issues -------------------------------------
  r.get(
    "/records/:id",
    asyncHandler(async (req, res) => {
      const record = await getRecord(db, req.params.id!);
      if (!record) throw notFound("Record not found.");
      const issues = await getIssuesForRecord(db, record.id);
      res.json({ record: serializeRecord(record, issues) });
    }),
  );

  // --- Update review status ------------------------------------------------
  r.patch(
    "/records/:id/review",
    asyncHandler(async (req, res) => {
      const parsed = reviewSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest("Invalid request body.", parsed.error.flatten());

      const updated = await updateReviewStatus(
        db,
        req.params.id!,
        parsed.data.reviewStatus,
        parsed.data.note ?? null,
      );
      if (!updated) throw notFound("Record not found.");
      const issues = await getIssuesForRecord(db, updated.id);
      res.json({ record: serializeRecord(updated, issues) });
    }),
  );

  return r;
}
