import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../errors.js";

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({
      error: error.code,
      message: error.message
    });
  }

  const message =
    error instanceof Error ? error.message : "An unexpected error occurred";

  return res.status(500).json({
    error: "internal_server_error",
    message
  });
}
