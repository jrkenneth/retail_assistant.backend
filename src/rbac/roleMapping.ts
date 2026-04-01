import type { AccessRole } from "./types.js";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function mapAccessRole(jobTitle: string, department: string): AccessRole {
  const normalizedTitle = normalize(jobTitle);
  const normalizedDepartment = normalize(department);

  if (normalizedTitle === "customer" || normalizedDepartment === "customers") {
    return "customer";
  }

  if (normalizedDepartment === "human resources" && normalizedTitle.includes("admin")) {
    return "admin";
  }

  if (normalizedDepartment === "human resources") {
    return "hr_officer";
  }

  if (normalizedDepartment === "finance") {
    return "finance_officer";
  }

  if (normalizedTitle.includes("manager") || normalizedTitle.includes("lead")) {
    return "manager";
  }

  return "employee";
}
