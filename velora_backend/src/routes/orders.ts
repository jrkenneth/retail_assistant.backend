import { Router } from "express";
import db from "../db.js";
import { notFound } from "../errors.js";
import { asyncHandler, paginate, parsePagination } from "../utils.js";

const router = Router();

function buildOrderQuery() {
  return db("orders")
    .innerJoin("customers", "orders.customer_id", "customers.id")
    .select(
      "orders.id",
      "orders.order_number",
      "orders.status",
      "orders.delivery_status",
      "orders.tracking_number",
      "orders.total_amount",
      "orders.shipping_address",
      "orders.estimated_delivery_date",
      "orders.actual_delivery_date",
      "orders.created_at",
      "orders.updated_at",
      "customers.customer_number",
      db.raw(`concat(customers.first_name, ' ', customers.last_name) as customer_name`)
    );
}

async function loadOrderItems(orderId: string) {
  return db("order_items")
    .innerJoin("products", "order_items.product_id", "products.id")
    .select(
      "order_items.id",
      "order_items.quantity",
      "order_items.unit_price",
      "order_items.subtotal",
      "products.sku",
      "products.name",
      "products.availability_status"
    )
    .where("order_items.order_id", orderId)
    .orderBy("products.name", "asc");
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req.query as Record<string, unknown>);
    const customerNumber =
      typeof req.query.customer_number === "string" ? req.query.customer_number.trim() : "";
    const orderNumber = typeof req.query.order_number === "string" ? req.query.order_number.trim() : "";
    const trackingNumber =
      typeof req.query.tracking_number === "string" ? req.query.tracking_number.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const deliveryStatus =
      typeof req.query.delivery_status === "string" ? req.query.delivery_status.trim() : "";

    const query = buildOrderQuery();

    if (customerNumber) {
      query.where("customers.customer_number", customerNumber);
    }

    if (orderNumber) {
      query.where("orders.order_number", orderNumber);
    }

    if (trackingNumber) {
      query.where("orders.tracking_number", trackingNumber);
    }

    if (status) {
      query.where("orders.status", status);
    }

    if (deliveryStatus) {
      query.where("orders.delivery_status", deliveryStatus);
    }

    query.orderBy("orders.created_at", "desc");

    const result = await paginate(query, pagination, "orders.id");
    res.status(200).json(result);
  })
);

router.get(
  "/:orderNumber",
  asyncHandler(async (req, res) => {
    const order = await buildOrderQuery()
      .where("orders.order_number", req.params.orderNumber)
      .first();

    if (!order) {
      throw notFound("Order not found");
    }

    const items = await loadOrderItems(String(order.id));
    res.status(200).json({
      data: {
        ...order,
        items,
      },
    });
  })
);

export default router;
