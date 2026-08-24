import { NextFunction, Request, Response } from "express";

/** Application-level error carrying an HTTP status and a stable code. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (msg: string) => new ApiError(404, "not_found", msg);
export const badRequest = (msg: string, details?: unknown) =>
  new ApiError(400, "bad_request", msg, details);

/** Wrap an async route so thrown errors reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

/** Terminal error middleware: renders a consistent JSON error envelope. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  console.error("[api] unhandled error:", err);
  res.status(500).json({
    error: { code: "internal_error", message: "An unexpected error occurred." },
  });
}
