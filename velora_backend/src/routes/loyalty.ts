import { Router } from "express";
import db from "../db.js";
import { notFound } from "../errors.js";
import { asyncHandler, paginate, parsePagination } from "../utils.js";

const router = Router();

router.get(
  "/:customerNumber",
  asyncHandler(async (req, res) => {
    const customer = await db("customers")
      .select("id", "customer_number", "loyalty_points", "account_status")
      .where("customer_number", req.params.customerNumber)
      .first();

    if (!customer) {
      throw notFound("Customer not found");
    }

    const pagination = parsePagination(req.query as Record<string, unknown>);
    const txQuery = db("loyalty_transactions")
      .leftJoin("orders", "loyalty_transactions.order_id", "orders.id")
      .select(
        "loyalty_transactions.id",
        "loyalty_transactions.transaction_type",
        "loyalty_transactions.points",
        "loyalty_transactions.description",
        "loyalty_transactions.created_at",
        "orders.order_number"
      )
      .where("loyalty_transactions.customer_id", customer.id)
      .orderBy("loyalty_transactions.created_at", "desc");

    const transactions = await paginate(txQuery, pagination, "loyalty_transactions.id");

    res.status(200).json({
      data: {
        customer_number: customer.customer_number,
        loyalty_points: customer.loyalty_points,
        account_status: customer.account_status,
        transactions: transactions.data,
      },
      meta: transactions.meta,
    });
  })
);

export default router;
