import { Router } from "express";
import db from "../db.js";
import { notFound } from "../errors.js";
import { asyncHandler, paginate, parseInteger, parsePagination } from "../utils.js";

const router = Router();

function payrollQuery() {
  return db("payroll")
    .innerJoin("employees", "payroll.employee_id", "employees.id")
    .innerJoin("job_titles", "employees.job_title_id", "job_titles.id")
    .innerJoin("job_grades", "job_titles.job_grade_id", "job_grades.id")
    .innerJoin("departments", "employees.department_id", "departments.id")
    .innerJoin("companies", "employees.company_id", "companies.id")
    .select(
      "employees.employee_number",
      db.raw(`concat(employees.first_name, ' ', employees.last_name) as full_name`),
      "payroll.gross_salary",
      "payroll.currency",
      "payroll.pay_frequency",
      "payroll.effective_from",
      "job_grades.code as job_grade",
      "departments.name as department"
    )
    .whereNull("payroll.effective_to");
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const departmentId = parseInteger(req.query.department_id, "department_id");
    const companyId = parseInteger(req.query.company_id, "company_id");
    const firstName = typeof req.query.first_name === "string" ? req.query.first_name : undefined;
    const lastName = typeof req.query.last_name === "string" ? req.query.last_name : undefined;
    const fullName = typeof req.query.full_name === "string" ? req.query.full_name : undefined;
    const departmentName =
      typeof req.query.department_name === "string" ? req.query.department_name : undefined;
    const pagination = parsePagination(req.query as Record<string, unknown>);

    const query = payrollQuery();

    if (departmentId) query.where("employees.department_id", departmentId);
    if (companyId) query.where("employees.company_id", companyId);
    if (firstName) query.whereILike("employees.first_name", `%${firstName}%`);
    if (lastName) query.whereILike("employees.last_name", `%${lastName}%`);
    if (fullName) {
      query.whereRaw(
        `LOWER(employees.first_name || ' ' || employees.last_name) LIKE ?`,
        [`%${fullName.toLowerCase()}%`]
      );
    }
    if (departmentName) query.whereILike("departments.name", `%${departmentName}%`);

    query.orderBy("payroll.created_at", "desc");

    const result = await paginate(query, pagination, "payroll.id");
    res.json(result);
  })
);

router.get(
  "/:employee_number",
  asyncHandler(async (req, res) => {
    const record = await payrollQuery()
      .where("employees.employee_number", req.params.employee_number)
      .first();

    if (!record) {
      throw notFound("Payroll record not found");
    }

    res.json({ data: record });
  })
);

export default router;
