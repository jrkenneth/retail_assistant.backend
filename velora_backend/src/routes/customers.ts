import { Router } from "express";
import db from "../db/knex.js";
import { notFound } from "../errors.js";
import { asyncHandler } from "../utils.js";

const router = Router();

async function loadCustomer(customerNumber: string) {
  return db("customers")
    .select(
      "id as customer_id",
      "customer_number",
      "first_name",
      "last_name",
      db.raw(`concat(first_name, ' ', last_name) as full_name`),
      "email",
      "phone",
      "address",
      "city",
      "country",
      "loyalty_points",
      "account_status"
    )
    .where("customer_number", customerNumber)
    .first();
}

router.get("/:customerNumber", asyncHandler(async (req, res) => {
  const customerNumber = Array.isArray(req.params.customerNumber)
    ? req.params.customerNumber[0]
    : req.params.customerNumber;
  const customer = await loadCustomer(customerNumber);
  if (!customer) {
    throw notFound("Customer not found");
  }
  res.status(200).json({ data: customer });
}));

router.get("/:customerNumber/profile", asyncHandler(async (req, res) => {
  const customerNumber = Array.isArray(req.params.customerNumber)
    ? req.params.customerNumber[0]
    : req.params.customerNumber;
  const customer = await loadCustomer(customerNumber);
  if (!customer) {
    throw notFound("Customer not found");
  }
  res.status(200).json({ data: customer });
}));

router.get("/:customerNumber/status", asyncHandler(async (req, res) => {
  const customerNumber = Array.isArray(req.params.customerNumber)
    ? req.params.customerNumber[0]
    : req.params.customerNumber;
  const customer = await loadCustomer(customerNumber);
  if (!customer) {
    throw notFound("Customer not found");
  }
  res.status(200).json({
    data: {
      customer_id: customer.customer_id,
      customer_number: customer.customer_number,
      first_name: customer.first_name,
      last_name: customer.last_name,
      full_name: customer.full_name,
      email: customer.email,
      loyalty_points: customer.loyalty_points,
      account_status: customer.account_status,
    },
  });
}));

export default router;
