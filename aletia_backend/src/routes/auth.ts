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
      .select("employee_number", "password_hash")
      .whereRaw("LOWER(username) = LOWER(?)", [username])
      .first();

    if (!credential) {
      throw unauthorized("Invalid username or password", "invalid_credentials");
    }

    const isValidPassword = await bcrypt.compare(password, credential.password_hash);
    if (!isValidPassword) {
      throw unauthorized("Invalid username or password", "invalid_credentials");
    }

    const employee = await db("employees")
      .leftJoin("employees as managers", "employees.manager_id", "managers.id")
      .innerJoin("job_titles", "employees.job_title_id", "job_titles.id")
      .innerJoin("job_grades", "job_titles.job_grade_id", "job_grades.id")
      .innerJoin("departments", "employees.department_id", "departments.id")
      .innerJoin("companies", "employees.company_id", "companies.id")
      .innerJoin("entities", "employees.entity_id", "entities.id")
      .select(
        "employees.employee_number",
        "employees.first_name",
        "employees.last_name",
        db.raw(`concat(employees.first_name, ' ', employees.last_name) as full_name`),
        "employees.email",
        "employees.phone",
        "job_titles.title as role",
        "job_grades.code as job_grade",
        "departments.name as department",
        "companies.name as company",
        "entities.name as entity",
        "employees.employment_type",
        db.raw(
          `case when employees.is_active = true and employees.date_left is null then 'active' else 'inactive' end as status`
        ),
        "employees.date_joined",
        "employees.manager_id",
        db.raw(`concat(managers.first_name, ' ', managers.last_name) as manager_name`)
      )
      .where("employees.employee_number", credential.employee_number)
      .first();

    if (!employee) {
      throw unauthorized("Invalid username or password", "invalid_credentials");
    }

    res.status(200).json({ data: employee });
  })
);

export default router;
