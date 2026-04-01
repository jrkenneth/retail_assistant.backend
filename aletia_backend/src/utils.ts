import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Knex } from "knex";
import { badRequest, unprocessable } from "./errors.js";

export interface Pagination {
  page: number;
  limit: number;
  offset: number;
}

export function parseInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw badRequest(`Invalid ${field}: expected an integer`);
  }

  return parsed;
}

export function parseDate(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest(`Invalid ${field}: expected YYYY-MM-DD`);
  }

  return value;
}

export function parsePagination(query: Record<string, unknown>): Pagination {
  const page = parseInteger(query.page, "page") ?? 1;
  const limit = parseInteger(query.limit, "limit") ?? 50;

  if (page < 1) {
    throw badRequest("Invalid page: must be greater than or equal to 1");
  }

  if (limit < 1 || limit > 200) {
    throw badRequest("Invalid limit: must be between 1 and 200");
  }

  return {
    page,
    limit,
    offset: (page - 1) * limit
  };
}

export async function paginate<T>(
  baseQuery: Knex.QueryBuilder,
  pagination: Pagination,
  countColumn = "*"
): Promise<{ data: T[]; meta: { total: number; page: number; limit: number; pages: number } }> {
  const countQuery = baseQuery
    .clone()
    .clearSelect()
    .clearOrder()
    .countDistinct({ total: countColumn });
  const countResult = await countQuery.first<{ total: string | number }>();
  const total = Number(countResult?.total ?? 0);
  const data = await baseQuery.limit(pagination.limit).offset(pagination.offset);

  return {
    data: data as T[],
    meta: {
      total,
      page: pagination.page,
      limit: pagination.limit,
      pages: total === 0 ? 0 : Math.ceil(total / pagination.limit)
    }
  };
}

export function validateRangeFilters(from?: string, to?: string, label = "date range") {
  if (from && to && from > to) {
    throw unprocessable(`Invalid ${label}: from date cannot be after to date`);
  }
}

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
