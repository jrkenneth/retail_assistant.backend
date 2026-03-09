import cors from "cors";
import express from "express";
import path from "node:path";
import { env } from "./config.js";
import { db } from "./db/client.js";
import { chatRouter } from "./routes/chat.js";
import { presentationsRouter } from "./routes/presentations.js";
import { sessionsRouter } from "./routes/sessions.js";

export const app = express();

app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());
app.use("/exports", express.static(path.resolve(process.cwd(), "storage", "exports")));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "backend" });
});

app.use("/chat", chatRouter);
app.use("/sessions", sessionsRouter);
app.use("/presentations", presentationsRouter);

app.get("/health/db", async (_req, res) => {
  try {
    await db.raw("select 1");
    res.status(200).json({ status: "ok", service: "postgres" });
  } catch {
    res.status(500).json({ status: "error", service: "postgres" });
  }
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof Error) {
    res.status(400).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: "unknown_error" });
});
