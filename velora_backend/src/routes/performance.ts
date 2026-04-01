import { Router } from "express";
import db from "../db.js";
import { notFound } from "../errors.js";
import { asyncHandler, paginate, parseInteger, parsePagination } from "../utils.js";

const router = Router();

function performanceBaseQuery() {
  return db("performance_reviews")
    .innerJoin("employees", "performance_reviews.employee_id", "employees.id")
    .innerJoin("employees as reviewers", "performance_reviews.reviewer_id", "reviewers.id")
    .innerJoin("departments", "employees.department_id", "departments.id")
    .select(
      "performance_reviews.id",
      "employees.employee_number",
      db.raw(`concat(employees.first_name, ' ', employees.last_name) as full_name`),
      "performance_reviews.review_period",
      "performance_reviews.rating",
      "performance_reviews.status",
      db.raw(`concat(reviewers.first_name, ' ', reviewers.last_name) as reviewer_name`),
      "performance_reviews.submitted_at",
      "performance_reviews.comments"
    );
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const employeeId = parseInteger(req.query.employee_id, "employee_id");
    const reviewerId = parseInteger(req.query.reviewer_id, "reviewer_id");
    const departmentId = parseInteger(req.query.department_id, "department_id");
    const employeeNumber =
      typeof req.query.employee_number === "string" ? req.query.employee_number : undefined;
    const reviewPeriod =
      typeof req.query.review_period === "string" ? req.query.review_period : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const firstName = typeof req.query.first_name === "string" ? req.query.first_name : undefined;
    const lastName = typeof req.query.last_name === "string" ? req.query.last_name : undefined;
    const fullName = typeof req.query.full_name === "string" ? req.query.full_name : undefined;
    const departmentName =
      typeof req.query.department_name === "string" ? req.query.department_name : undefined;
    const pagination = parsePagination(req.query as Record<string, unknown>);

    const query = performanceBaseQuery();

    if (employeeId) query.where("performance_reviews.employee_id", employeeId);
    if (employeeNumber) query.where("employees.employee_number", employeeNumber);
    if (reviewerId) query.where("performance_reviews.reviewer_id", reviewerId);
    if (reviewPeriod) query.where("performance_reviews.review_period", reviewPeriod);
    if (status) query.where("performance_reviews.status", status);
    if (departmentId) query.where("employees.department_id", departmentId);
    if (firstName) query.whereILike("employees.first_name", `%${firstName}%`);
    if (lastName) query.whereILike("employees.last_name", `%${lastName}%`);
    if (fullName) {
      query.whereRaw(
        `LOWER(employees.first_name || ' ' || employees.last_name) LIKE ?`,
        [`%${fullName.toLowerCase()}%`]
      );
    }
    if (departmentName) query.whereILike("departments.name", `%${departmentName}%`);

    query.orderByRaw("performance_reviews.submitted_at desc nulls last, performance_reviews.id desc");

    const result = await paginate(query, pagination, "performance_reviews.id");
    res.json(result);
  })
);

router.get(
  "/:employee_number",
  asyncHandler(async (req, res) => {
    const employee = await db("employees")
      .where("employee_number", req.params.employee_number)
      .first("id");

    if (!employee) {
      throw notFound("Employee not found");
    }

    const reviews = await performanceBaseQuery()
      .where("employees.employee_number", req.params.employee_number)
      .orderByRaw("performance_reviews.submitted_at desc nulls last, performance_reviews.id desc");

    res.json({
      data: reviews,
      meta: {
        total: reviews.length,
        page: 1,
        limit: reviews.length,
        pages: reviews.length === 0 ? 0 : 1
      }
    });
  })
);

export default router;
