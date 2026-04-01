import dotenv from "dotenv";
import express from "express";
import db from "./db.js";
import { notFound } from "./errors.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { authMiddleware } from "./middleware/auth.js";
import healthRoutes from "./routes/health.js";
import authRoutes from "./routes/auth.js";
import employeeRoutes from "./routes/employees.js";
import leaveRoutes from "./routes/leave.js";
import payrollRoutes from "./routes/payroll.js";
import performanceRoutes from "./routes/performance.js";
import historyRoutes from "./routes/history.js";

dotenv.config();

const app = express();

app.use(express.json());
app.use(requestLogger);

app.use("/health", healthRoutes);
app.use("/api/v1", authMiddleware);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/employees", employeeRoutes);
app.use("/api/v1/leave", leaveRoutes);
app.use("/api/v1/payroll", payrollRoutes);
app.use("/api/v1/performance", performanceRoutes);
app.use("/api/v1/history", historyRoutes);
app.use((_req, _res, next) => next(notFound("Resource not found")));

app.use(errorHandler);

const port = Number(process.env.PORT ?? 4001);

async function start() {
  try {
    await db.raw("select 1");
    app.listen(port, () => {
      console.log(`Aletia HR Platform listening on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start application", error);
    process.exit(1);
  }
}

void start();

export default app;
