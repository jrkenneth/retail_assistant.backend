import { Router } from "express";
import db from "../db.js";
import { notFound } from "../errors.js";
import { asyncHandler, parseDate, validateRangeFilters } from "../utils.js";

const router = Router();

router.get(
  "/:employee_number",
  asyncHandler(async (req, res) => {
    const employee = await db("employees")
      .where("employee_number", req.params.employee_number)
      .first("id");

    if (!employee) {
      throw notFound("Employee not found");
    }

    const dateFrom = parseDate(req.query.date_from, "date_from");
    const dateTo = parseDate(req.query.date_to, "date_to");
    const changeReason =
      typeof req.query.change_reason === "string" ? req.query.change_reason : undefined;

    validateRangeFilters(dateFrom, dateTo, "history date range");

    const query = db("employment_history")
      .innerJoin("employees", "employment_history.employee_id", "employees.id")
      .innerJoin("job_titles", "employment_history.job_title_id", "job_titles.id")
      .innerJoin("departments", "employment_history.department_id", "departments.id")
      .innerJoin("companies", "employment_history.company_id", "companies.id")
      .select(
        "employment_history.id",
        "employees.employee_number",
        db.raw(`concat(employees.first_name, ' ', employees.last_name) as full_name`),
        "job_titles.title as job_title",
        "departments.name as department",
        "companies.name as company",
        "employment_history.effective_from",
        "employment_history.effective_to",
        "employment_history.change_reason"
      )
      .where("employees.employee_number", req.params.employee_number);

    if (dateFrom) query.where("employment_history.effective_from", ">=", dateFrom);
    if (dateTo) query.where((builder) =>
      builder
        .where("employment_history.effective_to", "<=", dateTo)
        .orWhereNull("employment_history.effective_to")
    );
    if (changeReason) query.where("employment_history.change_reason", changeReason);

    const records = await query.orderBy("employment_history.effective_from", "desc");

    res.json({
      data: records,
      meta: {
        total: records.length,
        page: 1,
        limit: records.length,
        pages: records.length === 0 ? 0 : 1
      }
    });
  })
);

export default router;
