import { Router } from "express";
import axios from "axios";
import { env } from "../config.js";

export const catalogRouter = Router();

const velor = axios.create({
  baseURL: env.ECOMMERCE_API_URL,
  headers: { VELORA_API_KEY: env.ECOMMERCE_API_KEY },
  timeout: 10_000,
});

catalogRouter.get("/", async (req, res) => {
  try {
    const response = await velor.get("/api/v1/products", {
      params: {
        limit: req.query.limit ?? 100,
        page: req.query.page ?? 1,
        query: req.query.query,
        category: req.query.category,
        availability: req.query.availability,
      },
    });
    res.status(200).json(response.data);
  } catch {
    res.status(502).json({ error: "catalog_unavailable" });
  }
});

catalogRouter.get("/:sku", async (req, res) => {
  try {
    const response = await velor.get(`/api/v1/products/${req.params.sku}`);
    res.status(200).json(response.data);
  } catch {
    res.status(502).json({ error: "product_unavailable" });
  }
});
