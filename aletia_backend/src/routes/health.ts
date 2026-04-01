import { Router, type Request, type Response } from "express";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "Aletia HR Platform",
    timestamp: new Date().toISOString()
  });
});

export default router;
