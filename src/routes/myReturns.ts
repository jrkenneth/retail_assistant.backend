import { Router } from "express";
import axios from "axios";
import { env } from "../config.js";

export const myReturnsRouter = Router();

const velor = axios.create({
  baseURL: env.ECOMMERCE_API_URL,
  headers: { VELORA_API_KEY: env.ECOMMERCE_API_KEY },
  timeout: 10_000,
});

myReturnsRouter.get("/", async (req, res) => {
  const customerNumber = req.user?.customer_number;
  if (!customerNumber) {
    res.status(401).json({ error: "missing_customer_number" });
    return;
  }

  try {
    const response = await velor.get("/api/v1/returns", {
      params: {
        customer_number: customerNumber,
        limit: req.query.limit ?? 50,
        page: req.query.page ?? 1,
      },
    });
    res.status(200).json(response.data);
  } catch {
    res.status(502).json({ error: "returns_unavailable" });
  }
});
