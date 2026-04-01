import dotenv from "dotenv";
import express from "express";
import db from "./db.js";
import { notFound } from "./errors.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { authMiddleware } from "./middleware/auth.js";
import healthRoutes from "./routes/health.js";
import authRoutes from "./routes/auth.js";
import customerRoutes from "./routes/customers.js";
import productRoutes from "./routes/products.js";
import orderRoutes from "./routes/orders.js";
import returnRoutes from "./routes/returns.js";
import supportTicketRoutes from "./routes/supportTickets.js";
import loyaltyRoutes from "./routes/loyalty.js";
import policyRoutes from "./routes/policies.js";

dotenv.config();

const app = express();

app.use(express.json());
app.use(requestLogger);

app.use("/health", healthRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1", authMiddleware);
app.use("/api/v1/customers", customerRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/returns", returnRoutes);
app.use("/api/v1/support-tickets", supportTicketRoutes);
app.use("/api/v1/loyalty", loyaltyRoutes);
app.use("/api/v1/policies", policyRoutes);
app.use((_req, _res, next) => next(notFound("Resource not found")));

app.use(errorHandler);

const port = Number(process.env.PORT ?? 4001);

async function start() {
  try {
    await db.raw("select 1");
    app.listen(port, () => {
      console.log(`Velora Backend listening on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start application", error);
    process.exit(1);
  }
}

void start();

export default app;
