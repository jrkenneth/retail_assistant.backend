import type { NextFunction, Request, Response } from "express";
import { unauthorized } from "../errors.js";

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const apiKey = req.header("VELORA_API_KEY") ?? req.header("X-API-Key");
  const expectedApiKey = process.env.API_KEY ?? process.env.VELORA_API_KEY;

  if (!apiKey || !expectedApiKey || apiKey !== expectedApiKey) {
    return next(unauthorized());
  }

  next();
}
