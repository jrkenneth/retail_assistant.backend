import { randomUUID } from "node:crypto";
import { Router } from "express";
import db from "../db/knex.js";
import { badRequest, notFound } from "../errors.js";
import { asyncHandler, paginate, parseInteger, parsePagination } from "../utils.js";

const router = Router();

function buildTicketsQuery() {
  return db("support_tickets")
    .innerJoin("customers", "support_tickets.customer_id", "customers.id")
    .leftJoin("orders", "support_tickets.order_id", "orders.id")
    .select(
      "support_tickets.id",
      "support_tickets.ticket_number",
      "support_tickets.subject",
      "support_tickets.description",
      "support_tickets.status",
      "support_tickets.priority",
      "support_tickets.assigned_to",
      "support_tickets.queue_position",
      "support_tickets.estimated_wait_minutes",
      "support_tickets.resolution_notes",
      "support_tickets.created_at",
      "support_tickets.updated_at",
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
    const priority = typeof req.query.priority === "string" ? req.query.priority.trim() : "";

    const query = buildTicketsQuery();

    if (customerNumber) {
      query.where("customers.customer_number", customerNumber);
    }

    if (orderNumber) {
      query.where("orders.order_number", orderNumber);
    }

    if (status) {
      query.where("support_tickets.status", status);
    }

    if (priority) {
      query.where("support_tickets.priority", priority);
    }

    query.orderBy("support_tickets.created_at", "desc");

    const result = await paginate(query, pagination, "support_tickets.id");
    res.status(200).json(result);
  })
);

router.get(
  "/:ticketNumber",
  asyncHandler(async (req, res) => {
    const ticket = await buildTicketsQuery()
      .where("support_tickets.ticket_number", req.params.ticketNumber)
      .first();

    if (!ticket) {
      throw notFound("Support ticket not found");
    }

    res.status(200).json({ data: ticket });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const customerNumber =
      typeof req.body?.customer_number === "string" ? req.body.customer_number.trim() : "";
    const subject = typeof req.body?.subject === "string" ? req.body.subject.trim() : "";
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
    const priority = typeof req.body?.priority === "string" ? req.body.priority.trim() : "medium";
    const orderNumber = typeof req.body?.order_number === "string" ? req.body.order_number.trim() : "";
    const estimatedWaitMinutes = parseInteger(req.body?.estimated_wait_minutes, "estimated_wait_minutes");
    const queuePosition = parseInteger(req.body?.queue_position, "queue_position");

    if (!customerNumber || !subject || !description) {
      throw badRequest("customer_number, subject, and description are required");
    }

    const customer = await db("customers")
      .select("id")
      .where("customer_number", customerNumber)
      .first();

    if (!customer) {
      throw notFound("Customer not found");
    }

    let orderId: string | null = null;
    if (orderNumber) {
      const order = await db("orders")
        .select("id")
        .where("order_number", orderNumber)
        .first();

      if (!order) {
        throw notFound("Order not found");
      }

      orderId = String(order.id);
    }

    const ticketNumber = `TKT-${Date.now().toString().slice(-6)}`;
    await db("support_tickets").insert({
      id: randomUUID(),
      ticket_number: ticketNumber,
      customer_id: customer.id,
      order_id: orderId,
      subject,
      description,
      status: "open",
      priority,
      assigned_to: null,
      queue_position: queuePosition ?? null,
      estimated_wait_minutes: estimatedWaitMinutes ?? null,
      resolution_notes: null,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    const created = await buildTicketsQuery()
      .where("support_tickets.ticket_number", ticketNumber)
      .first();

    res.status(201).json({ data: created });
  })
);

export default router;
