import { randomUUID } from "node:crypto";
import { Router } from "express";
import db from "../db/knex.js";
import { badRequest, notFound } from "../errors.js";
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

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const customerNumber =
      typeof req.body?.customer_number === "string" ? req.body.customer_number.trim() : "";
    const orderNumber = typeof req.body?.order_number === "string" ? req.body.order_number.trim() : "";
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

    if (!customerNumber || !orderNumber || !reason) {
      throw badRequest("customer_number, order_number, and reason are required");
    }

    const order = await db("orders")
      .innerJoin("customers", "orders.customer_id", "customers.id")
      .select("orders.id as order_id", "customers.id as customer_id", "orders.total_amount")
      .where("orders.order_number", orderNumber)
      .andWhere("customers.customer_number", customerNumber)
      .first();

    if (!order) {
      throw notFound("Order not found");
    }

    const returnNumber = `RET-${Date.now().toString().slice(-6)}`;
    await db("returns").insert({
      id: randomUUID(),
      return_number: returnNumber,
      order_id: order.order_id,
      customer_id: order.customer_id,
      status: "requested",
      reason,
      refund_amount: order.total_amount,
      refund_status: "pending",
      requested_at: db.fn.now(),
      resolved_at: null,
    });

    const created = await buildReturnsQuery()
      .where("returns.return_number", returnNumber)
      .first();

    res.status(201).json({ data: created });
  })
);

export default router;
