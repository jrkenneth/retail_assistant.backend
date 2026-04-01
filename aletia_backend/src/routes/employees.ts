import { Router } from "express";
import db from "../db.js";
import { notFound } from "../errors.js";
import { employeeBaseQuery } from "../queryBuilders.js";
import {
  asyncHandler,
  paginate,
  parseDate,
  parseInteger,
  parsePagination,
  validateRangeFilters
} from "../utils.js";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const departmentId = parseInteger(req.query.department_id, "department_id");
    const companyId = parseInteger(req.query.company_id, "company_id");
    const entityId = parseInteger(req.query.entity_id, "entity_id");
    const managerId = parseInteger(req.query.manager_id, "manager_id");
    const dateJoinedFrom = parseDate(req.query.date_joined_from, "date_joined_from");
    const dateJoinedTo = parseDate(req.query.date_joined_to, "date_joined_to");
    const employmentType =
      typeof req.query.employment_type === "string" ? req.query.employment_type : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const firstName = typeof req.query.first_name === "string" ? req.query.first_name : undefined;
    const lastName = typeof req.query.last_name === "string" ? req.query.last_name : undefined;
    const fullName = typeof req.query.full_name === "string" ? req.query.full_name : undefined;
    const departmentName =
      typeof req.query.department_name === "string" ? req.query.department_name : undefined;
    const pagination = parsePagination(req.query as Record<string, unknown>);

    validateRangeFilters(dateJoinedFrom, dateJoinedTo, "date_joined range");

    const query = employeeBaseQuery(db);

    if (departmentId) query.where("employees.department_id", departmentId);
    if (companyId) query.where("employees.company_id", companyId);
    if (entityId) query.where("employees.entity_id", entityId);
    if (managerId) query.where("employees.manager_id", managerId);
    if (employmentType) query.where("employees.employment_type", employmentType);
    if (firstName) query.whereILike("employees.first_name", `%${firstName}%`);
    if (lastName) query.whereILike("employees.last_name", `%${lastName}%`);
    if (fullName) {
      query.whereRaw(
        `LOWER(employees.first_name || ' ' || employees.last_name) LIKE ?`,
        [`%${fullName.toLowerCase()}%`]
      );
    }
    if (departmentName) query.whereILike("departments.name", `%${departmentName}%`);
    if (dateJoinedFrom) query.where("employees.date_joined", ">=", dateJoinedFrom);
    if (dateJoinedTo) query.where("employees.date_joined", "<=", dateJoinedTo);
    if (status === "active") {
      query.where("employees.is_active", true).whereNull("employees.date_left");
    }
    if (status === "inactive") {
      query.where((builder) =>
        builder.where("employees.is_active", false).orWhereNotNull("employees.date_left")
      );
    }

    query.orderBy("employees.created_at", "desc");

    const result = await paginate(query, pagination, "employees.id");
    res.json(result);
  })
);

router.get(
  "/:employee_number",
  asyncHandler(async (req, res) => {
    const employee = await employeeBaseQuery(db)
      .where("employees.employee_number", req.params.employee_number)
      .first();

    if (!employee) {
      throw notFound("Employee not found");
    }

    res.json({ data: employee });
  })
);

router.get(
  "/:employee_number/summary",
  asyncHandler(async (req, res) => {
    const employee = await db("employees")
      .innerJoin("job_titles", "employees.job_title_id", "job_titles.id")
      .innerJoin("departments", "employees.department_id", "departments.id")
      .innerJoin("companies", "employees.company_id", "companies.id")
      .select(
        "employees.employee_number",
        db.raw(`concat(employees.first_name, ' ', employees.last_name) as full_name`),
        "job_titles.title as job_title",
        "departments.name as department",
        "companies.name as company",
        "employees.email",
        db.raw(
          `case when employees.is_active = true and employees.date_left is null then 'active' else 'inactive' end as status`
        )
      )
      .where("employees.employee_number", req.params.employee_number)
      .first();

    if (!employee) {
      throw notFound("Employee not found");
    }

    res.json({ data: employee });
  })
);

export default router;
