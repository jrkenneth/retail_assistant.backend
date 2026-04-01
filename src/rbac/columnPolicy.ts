import type { AccessRole } from "./types.js";

export const HARD_BLOCKED_COLUMNS = [
  "bank_account",
  "bank_name",
  "id_number",
  "date_of_birth",
  "address",
] as const;

export const HR_INTENTS = [
  "query_employees",
  "get_employee_profile",
  "get_employee_summary",
  "query_leave",
  "get_leave_balance",
  "query_payroll",
  "get_employee_payroll",
  "query_performance",
  "get_employee_performance",
  "get_employment_history",
  "health_check",
] as const;

type PolicyEntry = {
  allowedIntents: readonly string[];
  allowedColumns: readonly string[];
};

const employeeColumns = [
  "employee_number",
  "full_name",
  "job_title",
  "department",
  "status",
  "leave_type",
  "start_date",
  "end_date",
  "days_taken",
  "balances",
  "gross_salary",
  "currency",
  "pay_frequency",
  "effective_from",
];

const broadEmployeeColumns = [
  "id",
  "employee_number",
  "first_name",
  "last_name",
  "full_name",
  "email",
  "phone",
  "job_title",
  "job_grade",
  "department",
  "company",
  "entity",
  "employment_type",
  "status",
  "date_joined",
  "manager_id",
  "manager_name",
  "leave_type",
  "start_date",
  "end_date",
  "days_taken",
  "approved_by_name",
  "created_at",
  "review_period",
  "rating",
  "submitted_at",
  "comments",
  "reviewer_name",
  "gross_salary",
  "currency",
  "pay_frequency",
  "effective_from",
  "balances",
  "effective_to",
  "change_reason",
];

export const COLUMN_POLICY: Record<AccessRole, PolicyEntry> = {
  employee: {
    allowedIntents: [
      "get_employee_profile",
      "get_employee_summary",
      "query_leave",
      "get_leave_balance",
      "get_employee_payroll",
    ],
    allowedColumns: employeeColumns,
  },
  manager: {
    allowedIntents: [
      "query_employees",
      "get_employee_profile",
      "get_employee_summary",
      "query_leave",
      "query_performance",
      "get_employee_performance",
      "get_employment_history",
      "health_check",
    ],
    allowedColumns: broadEmployeeColumns,
  },
  hr_officer: {
    allowedIntents: HR_INTENTS,
    allowedColumns: broadEmployeeColumns,
  },
  finance_officer: {
    allowedIntents: ["query_payroll", "health_check"],
    allowedColumns: [
      "department",
      "currency",
      "employee_count",
      "total_gross_salary",
      "average_gross_salary",
    ],
  },
  admin: {
    allowedIntents: HR_INTENTS,
    allowedColumns: broadEmployeeColumns,
  },
};
