import cors from "cors";
import express from "express";
import { authenticateToken } from "./auth/authenticateToken.js";
import { env } from "./config.js";
import { db } from "./db/client.js";
import { accessRequestsRouter } from "./routes/accessRequests.js";
import { authRouter } from "./routes/auth.js";
import { artifactsRouter } from "./routes/artifacts.js";
import { catalogRouter } from "./routes/catalog.js";
import { chatRouter } from "./routes/chat.js";
import { myOrdersRouter } from "./routes/myOrders.js";
import { myReturnsRouter } from "./routes/myReturns.js";
import { sessionsRouter } from "./routes/sessions.js";

export const app = express();

app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "backend" });
});

app.get("/health/db", async (_req, res) => {
  try {
    await db.raw("select 1");
    res.status(200).json({ status: "ok", service: "postgres" });
  } catch {
    res.status(500).json({ status: "error", service: "postgres" });
  }
});

app.use("/api/auth", authRouter);
app.use(authenticateToken);
app.use("/chat", chatRouter);
app.use("/sessions", sessionsRouter);
app.use("/artifacts", artifactsRouter);
app.use("/access-requests", accessRequestsRouter);
app.use("/catalog", catalogRouter);
app.use("/my-orders", myOrdersRouter);
app.use("/my-returns", myReturnsRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof Error) {
    res.status(400).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: "unknown_error" });
});
