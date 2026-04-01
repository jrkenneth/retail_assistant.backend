import { Router } from "express";
import db from "../db.js";
import { notFound } from "../errors.js";
import {
  asyncHandler,
  paginate,
  parseDate,
  parseInteger,
  parsePagination,
  validateRangeFilters
} from "../utils.js";

const router = Router();

interface LeaveTypeRow {
  id: number;
  name: string;
  max_days: number | null;
}

interface LeaveUsageRow {
  name: string;
  taken?: string | number | null;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const employeeId = parseInteger(req.query.employee_id, "employee_id");
    const departmentId = parseInteger(req.query.department_id, "department_id");
    const employeeNumber =
      typeof req.query.employee_number === "string" ? req.query.employee_number : undefined;
    const leaveType = typeof req.query.leave_type === "string" ? req.query.leave_type : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const firstName = typeof req.query.first_name === "string" ? req.query.first_name : undefined;
    const lastName = typeof req.query.last_name === "string" ? req.query.last_name : undefined;
    const fullName = typeof req.query.full_name === "string" ? req.query.full_name : undefined;
    const departmentName =
      typeof req.query.department_name === "string" ? req.query.department_name : undefined;
    const dateFrom = parseDate(req.query.date_from, "date_from");
    const dateTo = parseDate(req.query.date_to, "date_to");
    const pagination = parsePagination(req.query as Record<string, unknown>);

    validateRangeFilters(dateFrom, dateTo, "leave date range");

    const query = db("leave_records")
      .innerJoin("employees", "leave_records.employee_id", "employees.id")
      .leftJoin("employees as approvers", "leave_records.approved_by", "approvers.id")
      .innerJoin("leave_types", "leave_records.leave_type_id", "leave_types.id")
      .innerJoin("departments", "employees.department_id", "departments.id")
      .select(
        "leave_records.id",
        "employees.employee_number",
        db.raw(`concat(employees.first_name, ' ', employees.last_name) as full_name`),
        "leave_types.name as leave_type",
        "leave_records.start_date",
        "leave_records.end_date",
        "leave_records.days_taken",
        "leave_records.status",
        db.raw(`concat(approvers.first_name, ' ', approvers.last_name) as approved_by_name`),
        "leave_records.created_at"
      );

    if (employeeId) query.where("leave_records.employee_id", employeeId);
    if (employeeNumber) query.where("employees.employee_number", employeeNumber);
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
    if (leaveType) query.where("leave_types.name", leaveType);
    if (status) query.where("leave_records.status", status);
    if (dateFrom) query.where("leave_records.start_date", ">=", dateFrom);
    if (dateTo) query.where("leave_records.end_date", "<=", dateTo);

    query.orderBy("leave_records.created_at", "desc");

    const result = await paginate(query, pagination, "leave_records.id");
    res.json(result);
  })
);

router.get(
  "/balance/:employee_number",
  asyncHandler(async (req, res) => {
    const employee = await db("employees")
      .select(
        "employees.id",
        "employees.employee_number",
        db.raw(`concat(employees.first_name, ' ', employees.last_name) as full_name`)
      )
      .where("employees.employee_number", req.params.employee_number)
      .first();

    if (!employee) {
      throw notFound("Employee not found");
    }

    const leaveTypes = await db<LeaveTypeRow>("leave_types")
      .select("id", "name", "max_days")
      .orderBy("id");
    const usage = await db("leave_records")
      .innerJoin("leave_types", "leave_records.leave_type_id", "leave_types.id")
      .where("leave_records.employee_id", employee.id)
      .where("leave_records.status", "approved")
      .groupBy("leave_types.name")
      .select("leave_types.name")
      .sum({ taken: "leave_records.days_taken" }) as LeaveUsageRow[];

    const usageMap = usage.reduce<Record<string, number>>((accumulator, row) => {
      accumulator[row.name] = Number(row.taken ?? 0);
      return accumulator;
    }, {});

    const balances = leaveTypes.reduce<Record<string, { entitled: number | null; taken: number; remaining: number | null }>>(
      (accumulator, leaveTypeRow) => {
        const entitled =
          leaveTypeRow.max_days === null ? null : Number(leaveTypeRow.max_days);
        const taken = usageMap[leaveTypeRow.name] ?? 0;
        accumulator[leaveTypeRow.name] = {
          entitled,
          taken,
          remaining: entitled === null ? null : Math.max(entitled - taken, 0)
        };
        return accumulator;
      },
      {}
    );

    res.json({
      data: {
        employee_number: employee.employee_number,
        full_name: employee.full_name,
        balances
      }
    });
  })
);

export default router;
