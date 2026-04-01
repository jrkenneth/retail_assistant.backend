import bcrypt from "bcryptjs";
import { Router } from "express";
import db from "../db.js";
import { badRequest, unauthorized } from "../errors.js";
import { asyncHandler } from "../utils.js";

const router = Router();

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!username || !password) {
      throw badRequest("username and password are required");
    }

    const credential = await db("credentials")
      .select("customer_id", "password_hash")
      .whereRaw("LOWER(username) = LOWER(?)", [username])
      .first();

    if (!credential) {
      throw unauthorized("Invalid username or password", "invalid_credentials");
    }

    const isValidPassword = await bcrypt.compare(password, credential.password_hash);
    if (!isValidPassword) {
      throw unauthorized("Invalid username or password", "invalid_credentials");
    }

    const customer = await db("customers")
      .select(
        "customers.customer_number",
        "customers.first_name",
        "customers.last_name",
        db.raw(`concat(customers.first_name, ' ', customers.last_name) as full_name`),
        "customers.email",
        "customers.phone",
        "customers.address",
        "customers.city",
        "customers.country",
        "customers.loyalty_points",
        "customers.account_status"
      )
      .where("customers.id", credential.customer_id)
      .first();

    if (!customer) {
      throw unauthorized("Invalid username or password", "invalid_credentials");
    }

    res.status(200).json({ data: customer });
  })
);

export default router;
