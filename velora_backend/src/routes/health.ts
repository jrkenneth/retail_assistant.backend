import { Router, type Request, type Response } from "express";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "Ecommerce Demo Backend",
    timestamp: new Date().toISOString()
  });
});

export default router;
