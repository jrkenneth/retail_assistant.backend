import type { NextFunction, Request, Response } from "express";
import { unauthorized } from "../errors.js";

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const apiKey = req.header("VELORA_API_KEY") ?? req.header("ALETIA_API_KEY");
  const expectedApiKey = process.env.VELORA_API_KEY ?? process.env.ALETIA_API_KEY;

  if (!apiKey || !expectedApiKey || apiKey !== expectedApiKey) {
    return next(unauthorized());
  }

  next();
}
