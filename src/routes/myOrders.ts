import { Router } from "express";
import axios from "axios";
import { env } from "../config.js";

export const myOrdersRouter = Router();

const velor = axios.create({
  baseURL: env.ECOMMERCE_API_URL,
  headers: { VELORA_API_KEY: env.ECOMMERCE_API_KEY },
  timeout: 10_000,
});

myOrdersRouter.get("/", async (req, res) => {
  const customerNumber = req.user?.customer_number;
  if (!customerNumber) {
    res.status(401).json({ error: "missing_customer_number" });
    return;
  }

  try {
    const response = await velor.get("/api/v1/orders", {
      params: {
        customer_number: customerNumber,
        limit: req.query.limit ?? 50,
        page: req.query.page ?? 1,
      },
    });
    res.status(200).json(response.data);
  } catch {
    res.status(502).json({ error: "orders_unavailable" });
  }
});

myOrdersRouter.get("/:orderNumber/items", async (req, res) => {
  try {
    const response = await velor.get(`/api/v1/orders/${req.params.orderNumber}/items`);
    res.status(200).json(response.data);
  } catch {
    res.status(502).json({ error: "order_items_unavailable" });
  }
});
