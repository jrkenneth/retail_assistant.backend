import express from "express";
import { notFound } from "./errors.js";
import { authMiddleware } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import authRoutes from "./routes/auth.js";
import customerRoutes from "./routes/customers.js";
import healthRoutes from "./routes/health.js";
import loyaltyRoutes from "./routes/loyalty.js";
import orderRoutes from "./routes/orders.js";
import policyRoutes from "./routes/policies.js";
import productRoutes from "./routes/products.js";
import returnRoutes from "./routes/returns.js";
import supportRoutes from "./routes/support.js";

export function createApp() {
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
  app.use("/api/v1/support/tickets", supportRoutes);
  app.use("/api/v1/support-tickets", supportRoutes);
  app.use("/api/v1/customers", loyaltyRoutes);
  app.use("/api/v1/policies", policyRoutes);
  app.use((_req, _res, next) => next(notFound("Resource not found")));

  app.use(errorHandler);
  return app;
}

export default createApp();
