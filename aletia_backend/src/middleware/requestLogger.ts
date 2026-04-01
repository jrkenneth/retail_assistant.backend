import type { NextFunction, Request, Response } from "express";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const duration = Number(process.hrtime.bigint() - start) / 1_000_000;
    console.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} ${duration.toFixed(2)}ms`
    );
  });

  next();
}
