import type { Knex } from "knex";

export function employeeBaseQuery(db: Knex) {
  return db("employees")
    .leftJoin("employees as managers", "employees.manager_id", "managers.id")
    .innerJoin("job_titles", "employees.job_title_id", "job_titles.id")
    .innerJoin("job_grades", "job_titles.job_grade_id", "job_grades.id")
    .innerJoin("departments", "employees.department_id", "departments.id")
    .innerJoin("companies", "employees.company_id", "companies.id")
    .innerJoin("entities", "employees.entity_id", "entities.id")
    .select(
      "employees.id",
      "employees.employee_number",
      "employees.first_name",
      "employees.last_name",
      db.raw(`concat(employees.first_name, ' ', employees.last_name) as full_name`),
      "employees.email",
      "employees.phone",
      "job_titles.title as job_title",
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
    );
}
