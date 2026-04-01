import type { NextFunction, Request, Response } from "express";
import { unauthorized } from "../errors.js";

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const apiKey = req.header("ALETIA_API_KEY");

  if (!apiKey || apiKey !== process.env.ALETIA_API_KEY) {
    return next(unauthorized());
  }

  next();
}
