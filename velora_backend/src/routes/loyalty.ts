import { Router } from "express";
import db from "../db/knex.js";
import { notFound } from "../errors.js";
import { asyncHandler, paginate, parsePagination } from "../utils.js";

const router = Router();

async function loadCustomer(customerNumber: string) {
  return db("customers")
    .select("id", "customer_number", "loyalty_points", "account_status")
    .where("customer_number", customerNumber)
    .first();
}

async function loadTransactions(customerId: string, pagination: ReturnType<typeof parsePagination>) {
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
    .where("loyalty_transactions.customer_id", customerId)
    .orderBy("loyalty_transactions.created_at", "desc");

  return paginate(txQuery, pagination, "loyalty_transactions.id");
}

router.get("/:customerNumber/loyalty", asyncHandler(async (req, res) => {
  const customerNumber = Array.isArray(req.params.customerNumber)
    ? req.params.customerNumber[0]
    : req.params.customerNumber;
  const customer = await loadCustomer(customerNumber);
  if (!customer) {
    throw notFound("Customer not found");
  }

  const pagination = parsePagination(req.query as Record<string, unknown>);
  const transactions = await loadTransactions(String(customer.id), pagination);

  res.status(200).json({
    data: {
      customer_number: customer.customer_number,
      loyalty_points: customer.loyalty_points,
      account_status: customer.account_status,
      transactions: transactions.data,
    },
    meta: transactions.meta,
  });
}));

router.get("/:customerNumber/loyalty/history", asyncHandler(async (req, res) => {
  const customerNumber = Array.isArray(req.params.customerNumber)
    ? req.params.customerNumber[0]
    : req.params.customerNumber;
  const customer = await loadCustomer(customerNumber);
  if (!customer) {
    throw notFound("Customer not found");
  }

  const pagination = parsePagination(req.query as Record<string, unknown>);
  const transactions = await loadTransactions(String(customer.id), pagination);

  res.status(200).json({
    data: transactions.data,
    meta: transactions.meta,
  });
}));

export default router;
