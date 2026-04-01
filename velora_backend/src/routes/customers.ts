import { Router } from "express";
import db from "../db.js";
import { notFound } from "../errors.js";
import { asyncHandler } from "../utils.js";

const router = Router();

router.get(
  "/:customerNumber/profile",
  asyncHandler(async (req, res) => {
    const customer = await db("customers")
      .select(
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
      .where("customer_number", req.params.customerNumber)
      .first();

    if (!customer) {
      throw notFound("Customer not found");
    }

    res.status(200).json({ data: customer });
  })
);

export default router;
