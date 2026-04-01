import { Router } from "express";
import db from "../db.js";
import { notFound } from "../errors.js";
import { asyncHandler, paginate, parsePagination } from "../utils.js";

const router = Router();

function buildReturnsQuery() {
  return db("returns")
    .innerJoin("customers", "returns.customer_id", "customers.id")
    .innerJoin("orders", "returns.order_id", "orders.id")
    .select(
      "returns.id",
      "returns.return_number",
      "returns.status",
      "returns.reason",
      "returns.refund_amount",
      "returns.refund_status",
      "returns.requested_at",
      "returns.resolved_at",
      "customers.customer_number",
      "orders.order_number"
    );
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req.query as Record<string, unknown>);
    const customerNumber =
      typeof req.query.customer_number === "string" ? req.query.customer_number.trim() : "";
    const orderNumber = typeof req.query.order_number === "string" ? req.query.order_number.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";

    const query = buildReturnsQuery();

    if (customerNumber) {
      query.where("customers.customer_number", customerNumber);
    }

    if (orderNumber) {
      query.where("orders.order_number", orderNumber);
    }

    if (status) {
      query.where("returns.status", status);
    }

    query.orderBy("returns.requested_at", "desc");

    const result = await paginate(query, pagination, "returns.id");
    res.status(200).json(result);
  })
);

router.get(
  "/:returnNumber",
  asyncHandler(async (req, res) => {
    const record = await buildReturnsQuery()
      .where("returns.return_number", req.params.returnNumber)
      .first();

    if (!record) {
      throw notFound("Return not found");
    }

    res.status(200).json({ data: record });
  })
);

export default router;
