import bcrypt from "bcryptjs";
import type { Knex } from "knex";

type RecordMap = Record<string, number>;

const entities = [
  { name: "Rogers Capital Ltd", registration_number: "RC-001", entity_type: "holding" },
  {
    name: "Rogers Capital Fiduciary Services Ltd",
    registration_number: "RC-002",
    entity_type: "subsidiary"
  }
];

const companies = [
  {
    entity_registration: "RC-001",
    name: "Rogers Capital Ltd",
    company_code: "RCL",
    industry: "financial_services"
  },
  {
    entity_registration: "RC-002",
    name: "Rogers Capital Fiduciary Services Ltd",
    company_code: "RCFS",
    industry: "fiduciary"
  },
  {
    entity_registration: "RC-001",
    name: "Rogers Capital Technology Ltd",
    company_code: "RCTEC",
    industry: "technology"
  }
];

const departments = [
  { company_code: "RCL", name: "Finance", code: "FIN" },
  { company_code: "RCL", name: "Credit", code: "CRD" },
  { company_code: "RCL", name: "Human Resources", code: "HRM" },
  { company_code: "RCL", name: "Operations", code: "OPS" },
  { company_code: "RCFS", name: "Fiduciary", code: "FID" },
  { company_code: "RCFS", name: "Human Resources", code: "HRM" },
  { company_code: "RCFS", name: "Finance", code: "FIN" },
  { company_code: "RCTEC", name: "Technology", code: "TEC" },
  { company_code: "RCTEC", name: "Operations", code: "OPS" },
  { company_code: "RCTEC", name: "Human Resources", code: "HRM" }
];

const jobGrades = [
  { code: "G1", title: "Associate", level: 1, min_salary: 25000, max_salary: 40000 },
  { code: "G2", title: "Analyst", level: 2, min_salary: 40000, max_salary: 65000 },
  { code: "G3", title: "Senior Analyst", level: 3, min_salary: 65000, max_salary: 95000 },
  { code: "G4", title: "Team Lead", level: 4, min_salary: 95000, max_salary: 130000 },
  { code: "G5", title: "Manager", level: 5, min_salary: 130000, max_salary: 180000 },
  { code: "G6", title: "Senior Manager", level: 6, min_salary: 180000, max_salary: 250000 }
];

const jobTitles = [
  { title: "HR Officer", grade_code: "G2", department_code: "HRM" },
  { title: "HR Manager", grade_code: "G5", department_code: "HRM" },
  { title: "HR Admin", grade_code: "G6", department_code: "HRM" },
  { title: "Finance Analyst", grade_code: "G2", department_code: "FIN" },
  { title: "Finance Manager", grade_code: "G5", department_code: "FIN" },
  { title: "Credit Analyst", grade_code: "G2", department_code: "CRD" },
  { title: "Credit Manager", grade_code: "G5", department_code: "CRD" },
  { title: "Software Developer", grade_code: "G2", department_code: "TEC" },
  { title: "Tech Lead", grade_code: "G4", department_code: "TEC" },
  { title: "Operations Officer", grade_code: "G2", department_code: "OPS" },
  { title: "Fiduciary Officer", grade_code: "G2", department_code: "FID" },
  { title: "Fiduciary Manager", grade_code: "G5", department_code: "FID" }
];

const employees = [
  {
    employee_number: "EMP-001",
    first_name: "Priya",
    last_name: "Ramdhani",
    email: "priya.ramdhani@rogerscapital.mu",
    phone: "+23052541001",
    date_of_birth: "1985-02-14",
    date_joined: "2018-01-15",
    employment_type: "permanent",
    company_code: "RCL",
    entity_registration: "RC-001",
    department_code: "HRM",
    job_title: "HR Admin",
    manager_employee_number: null,
    is_active: true
  },
  {
    employee_number: "EMP-002",
    first_name: "Jean-Michel",
    last_name: "Lagesse",
    email: "jean-michel.lagesse@rogerscapital.mu",
    phone: "+23052541002",
    date_of_birth: "1988-07-22",
    date_joined: "2019-03-04",
    employment_type: "permanent",
    company_code: "RCL",
    entity_registration: "RC-001",
    department_code: "HRM",
    job_title: "HR Manager",
    manager_employee_number: "EMP-001",
    is_active: true
  },
  {
    employee_number: "EMP-003",
    first_name: "Nathalie",
    last_name: "Begue",
    email: "nathalie.begue@rogerscapital.mu",
    phone: "+23052541003",
    date_of_birth: "1992-11-03",
    date_joined: "2020-02-17",
    employment_type: "permanent",
    company_code: "RCL",
    entity_registration: "RC-001",
    department_code: "HRM",
    job_title: "HR Officer",
    manager_employee_number: "EMP-002",
    is_active: true
  },
  {
    employee_number: "EMP-004",
    first_name: "Vikash",
    last_name: "Foolchand",
    email: "vikash.foolchand@rogerscapital.mu",
    phone: "+23052541004",
    date_of_birth: "1994-05-18",
    date_joined: "2021-08-09",
    employment_type: "contract",
    company_code: "RCTEC",
    entity_registration: "RC-001",
    department_code: "HRM",
    job_title: "HR Officer",
    manager_employee_number: "EMP-002",
    is_active: true
  },
  {
    employee_number: "EMP-005",
    first_name: "Marie-Claire",
    last_name: "Delannoy",
    email: "marie-claire.delannoy@rogerscapital.mu",
    phone: "+23052541005",
    date_of_birth: "1987-09-10",
    date_joined: "2018-06-11",
    employment_type: "permanent",
    company_code: "RCL",
    entity_registration: "RC-001",
    department_code: "FIN",
    job_title: "Finance Manager",
    manager_employee_number: "EMP-001",
    is_active: true
  },
  {
    employee_number: "EMP-006",
    first_name: "Ashvin",
    last_name: "Mungroo",
    email: "ashvin.mungroo@rogerscapital.mu",
    phone: "+23052541006",
    date_of_birth: "1993-12-01",
    date_joined: "2020-09-14",
    employment_type: "permanent",
    company_code: "RCL",
    entity_registration: "RC-001",
    department_code: "FIN",
    job_title: "Finance Analyst",
    manager_employee_number: "EMP-005",
    is_active: true
  },
  {
    employee_number: "EMP-007",
    first_name: "Sophie",
    last_name: "Perrier",
    email: "sophie.perrier@rogerscapital.mu",
    phone: "+23052541007",
    date_of_birth: "1996-04-27",
    date_joined: "2022-04-11",
    employment_type: "contract",
    company_code: "RCFS",
    entity_registration: "RC-002",
    department_code: "FIN",
    job_title: "Finance Analyst",
    manager_employee_number: "EMP-005",
    is_active: true
  },
  {
    employee_number: "EMP-008",
    first_name: "Rishi",
    last_name: "Goburdhun",
    email: "rishi.goburdhun@rogerscapital.mu",
    phone: "+23052541008",
    date_of_birth: "1989-03-09",
    date_joined: "2019-11-18",
    employment_type: "permanent",
    company_code: "RCL",
    entity_registration: "RC-001",
    department_code: "CRD",
    job_title: "Credit Manager",
    manager_employee_number: "EMP-001",
    is_active: true
  },
  {
    employee_number: "EMP-009",
    first_name: "Laetitia",
    last_name: "Ah-Kine",
    email: "laetitia.ah-kine@rogerscapital.mu",
    phone: "+23052541009",
    date_of_birth: "1995-01-24",
    date_joined: "2021-01-12",
    employment_type: "permanent",
    company_code: "RCL",
    entity_registration: "RC-001",
    department_code: "CRD",
    job_title: "Credit Analyst",
    manager_employee_number: "EMP-008",
    is_active: true
  },
  {
    employee_number: "EMP-010",
    first_name: "Kevin",
    last_name: "Seeburn",
    email: "kevin.seeburn@rogerscapital.mu",
    phone: "+23052541010",
    date_of_birth: "1994-06-30",
    date_joined: "2023-01-09",
    employment_type: "contract",
    company_code: "RCL",
    entity_registration: "RC-001",
    department_code: "CRD",
    job_title: "Credit Analyst",
    manager_employee_number: "EMP-008",
    is_active: true
  },
  {
    employee_number: "EMP-011",
    first_name: "Anisha",
    last_name: "Rughooputh",
    email: "anisha.rughooputh@rogerscapital.mu",
    phone: "+23052541011",
    date_of_birth: "1990-08-05",
    date_joined: "2019-05-20",
    employment_type: "permanent",
    company_code: "RCTEC",
    entity_registration: "RC-001",
    department_code: "TEC",
    job_title: "Tech Lead",
    manager_employee_number: "EMP-001",
    is_active: true
  },
  {
    employee_number: "EMP-012",
    first_name: "Dominique",
    last_name: "Fontaine",
    email: "dominique.fontaine@rogerscapital.mu",
    phone: "+23052541012",
    date_of_birth: "1997-02-12",
    date_joined: "2022-06-13",
    employment_type: "permanent",
    company_code: "RCTEC",
    entity_registration: "RC-001",
    department_code: "TEC",
    job_title: "Software Developer",
    manager_employee_number: "EMP-011",
    is_active: true
  },
  {
    employee_number: "EMP-013",
    first_name: "Thierry",
    last_name: "Meunier",
    email: "thierry.meunier@rogerscapital.mu",
    phone: "+23052541013",
    date_of_birth: "1991-10-21",
    date_joined: "2020-01-06",
    employment_type: "permanent",
    company_code: "RCTEC",
    entity_registration: "RC-001",
    department_code: "TEC",
    job_title: "Software Developer",
    manager_employee_number: "EMP-011",
    is_active: true
  },
  {
    employee_number: "EMP-014",
    first_name: "Farida",
    last_name: "Oozeer",
    email: "farida.oozeer@rogerscapital.mu",
    phone: "+23052541014",
    date_of_birth: "1986-12-17",
    date_joined: "2018-09-03",
    employment_type: "permanent",
    company_code: "RCFS",
    entity_registration: "RC-002",
    department_code: "FID",
    job_title: "Fiduciary Manager",
    manager_employee_number: "EMP-001",
    is_active: true
  },
  {
    employee_number: "EMP-015",
    first_name: "Cyril",
    last_name: "Leclezio",
    email: "cyril.leclezio@rogerscapital.mu",
    phone: "+23052541015",
    date_of_birth: "1998-07-07",
    date_joined: "2023-03-01",
    employment_type: "permanent",
    company_code: "RCFS",
    entity_registration: "RC-002",
    department_code: "FID",
    job_title: "Fiduciary Officer",
    manager_employee_number: "EMP-014",
    is_active: true
  }
];

const employmentHistory = [
  { employee_number: "EMP-001", company_code: "RCL", department_code: "HRM", job_title: "HR Admin", effective_from: "2018-01-15", effective_to: null, change_reason: "initial" },
  { employee_number: "EMP-002", company_code: "RCL", department_code: "HRM", job_title: "HR Officer", effective_from: "2019-03-04", effective_to: "2022-01-31", change_reason: "initial" },
  { employee_number: "EMP-002", company_code: "RCL", department_code: "HRM", job_title: "HR Manager", effective_from: "2022-02-01", effective_to: null, change_reason: "promotion" },
  { employee_number: "EMP-003", company_code: "RCL", department_code: "HRM", job_title: "HR Officer", effective_from: "2020-02-17", effective_to: null, change_reason: "initial" },
  { employee_number: "EMP-004", company_code: "RCTEC", department_code: "HRM", job_title: "HR Officer", effective_from: "2021-08-09", effective_to: null, change_reason: "initial" },
  { employee_number: "EMP-005", company_code: "RCL", department_code: "FIN", job_title: "Finance Analyst", effective_from: "2018-06-11", effective_to: "2021-06-30", change_reason: "initial" },
  { employee_number: "EMP-005", company_code: "RCL", department_code: "FIN", job_title: "Finance Manager", effective_from: "2021-07-01", effective_to: null, change_reason: "promotion" },
  { employee_number: "EMP-006", company_code: "RCL", department_code: "FIN", job_title: "Finance Analyst", effective_from: "2020-09-14", effective_to: null, change_reason: "initial" },
  { employee_number: "EMP-007", company_code: "RCFS", department_code: "FIN", job_title: "Finance Analyst", effective_from: "2022-04-11", effective_to: null, change_reason: "initial" },
  { employee_number: "EMP-008", company_code: "RCL", department_code: "CRD", job_title: "Credit Analyst", effective_from: "2019-11-18", effective_to: "2023-01-31", change_reason: "initial" },
  { employee_number: "EMP-008", company_code: "RCL", department_code: "CRD", job_title: "Credit Manager", effective_from: "2023-02-01", effective_to: null, change_reason: "promotion" },
  { employee_number: "EMP-009", company_code: "RCL", department_code: "CRD", job_title: "Credit Analyst", effective_from: "2021-01-12", effective_to: null, change_reason: "initial" },
  { employee_number: "EMP-010", company_code: "RCL", department_code: "CRD", job_title: "Credit Analyst", effective_from: "2023-01-09", effective_to: null, change_reason: "initial" },
  { employee_number: "EMP-011", company_code: "RCTEC", department_code: "TEC", job_title: "Software Developer", effective_from: "2019-05-20", effective_to: "2022-09-30", change_reason: "initial" },
  { employee_number: "EMP-011", company_code: "RCTEC", department_code: "TEC", job_title: "Tech Lead", effective_from: "2022-10-01", effective_to: null, change_reason: "promotion" },
  { employee_number: "EMP-012", company_code: "RCTEC", department_code: "TEC", job_title: "Software Developer", effective_from: "2022-06-13", effective_to: null, change_reason: "initial" },
  { employee_number: "EMP-013", company_code: "RCTEC", department_code: "TEC", job_title: "Software Developer", effective_from: "2020-01-06", effective_to: null, change_reason: "initial" },
  { employee_number: "EMP-014", company_code: "RCFS", department_code: "FID", job_title: "Fiduciary Officer", effective_from: "2018-09-03", effective_to: "2021-03-31", change_reason: "initial" },
  { employee_number: "EMP-014", company_code: "RCFS", department_code: "FID", job_title: "Fiduciary Manager", effective_from: "2021-04-01", effective_to: null, change_reason: "promotion" },
  { employee_number: "EMP-015", company_code: "RCFS", department_code: "FID", job_title: "Fiduciary Officer", effective_from: "2023-03-01", effective_to: null, change_reason: "initial" }
];

const leaveTypes = [
  { name: "annual", max_days: 22 },
  { name: "sick", max_days: 15 },
  { name: "maternity", max_days: 84 },
  { name: "paternity", max_days: 5 },
  { name: "unpaid", max_days: null }
];

const leaveRecords = [
  ["EMP-003", "annual", "2024-02-12", "2024-02-14", 3, "approved", "EMP-002"],
  ["EMP-003", "sick", "2025-01-09", "2025-01-10", 2, "approved", "EMP-002"],
  ["EMP-004", "annual", "2024-08-05", "2024-08-07", 3, "approved", "EMP-002"],
  ["EMP-004", "sick", "2025-02-17", "2025-02-17", 1, "pending", "EMP-002"],
  ["EMP-006", "annual", "2024-04-15", "2024-04-19", 5, "approved", "EMP-005"],
  ["EMP-006", "sick", "2025-03-03", "2025-03-04", 2, "approved", "EMP-005"],
  ["EMP-007", "annual", "2024-12-23", "2024-12-27", 5, "approved", "EMP-005"],
  ["EMP-007", "sick", "2025-01-21", "2025-01-21", 1, "rejected", "EMP-005"],
  ["EMP-009", "annual", "2024-07-08", "2024-07-12", 5, "approved", "EMP-008"],
  ["EMP-009", "sick", "2025-02-10", "2025-02-11", 2, "approved", "EMP-008"],
  ["EMP-010", "annual", "2025-04-14", "2025-04-16", 3, "pending", "EMP-008"],
  ["EMP-010", "sick", "2024-11-01", "2024-11-01", 1, "approved", "EMP-008"],
  ["EMP-012", "annual", "2024-03-18", "2024-03-22", 5, "approved", "EMP-011"],
  ["EMP-012", "sick", "2025-01-28", "2025-01-28", 1, "approved", "EMP-011"],
  ["EMP-013", "annual", "2024-09-02", "2024-09-06", 5, "approved", "EMP-011"],
  ["EMP-013", "sick", "2025-03-12", "2025-03-13", 2, "pending", "EMP-011"],
  ["EMP-015", "annual", "2024-05-20", "2024-05-24", 5, "approved", "EMP-014"],
  ["EMP-015", "sick", "2025-02-24", "2025-02-24", 1, "approved", "EMP-014"],
  ["EMP-002", "annual", "2024-06-10", "2024-06-14", 5, "approved", "EMP-001"],
  ["EMP-005", "annual", "2025-07-14", "2025-07-18", 5, "approved", "EMP-001"],
  ["EMP-008", "annual", "2024-10-21", "2024-10-25", 5, "approved", "EMP-001"],
  ["EMP-011", "paternity", "2025-05-05", "2025-05-09", 5, "approved", "EMP-001"]
] as const;

const payrollRecords = [
  ["EMP-001", "2018-01-15", 225000],
  ["EMP-002", "2022-02-01", 155000],
  ["EMP-003", "2020-02-17", 52000],
  ["EMP-004", "2021-08-09", 47000],
  ["EMP-005", "2021-07-01", 168000],
  ["EMP-006", "2020-09-14", 59000],
  ["EMP-007", "2022-04-11", 51000],
  ["EMP-008", "2023-02-01", 150000],
  ["EMP-009", "2021-01-12", 56000],
  ["EMP-010", "2023-01-09", 44500],
  ["EMP-011", "2022-10-01", 118000],
  ["EMP-012", "2022-06-13", 58000],
  ["EMP-013", "2020-01-06", 62000],
  ["EMP-014", "2021-04-01", 158000],
  ["EMP-015", "2023-03-01", 48000]
] as const;

const performanceReviews = [
  ["EMP-003", "EMP-002", "FY2023", 4.2, "Strong delivery and good stakeholder support.", "acknowledged", "2024-01-18T09:30:00Z"],
  ["EMP-003", "EMP-002", "FY2024", 4.4, "Improved policy coordination and response time.", "acknowledged", "2025-01-16T10:00:00Z"],
  ["EMP-004", "EMP-002", "FY2024", 3.8, "Reliable support across the technology entity.", "submitted", "2025-01-20T08:45:00Z"],
  ["EMP-005", "EMP-001", "FY2023", 4.7, "Led finance reporting improvements successfully.", "acknowledged", "2024-01-22T11:00:00Z"],
  ["EMP-005", "EMP-001", "FY2024", 4.8, "Consistent leadership across group finance.", "acknowledged", "2025-01-14T13:15:00Z"],
  ["EMP-006", "EMP-005", "FY2023", 3.9, "Strong analytical output with room to deepen forecasting.", "submitted", "2024-01-24T12:00:00Z"],
  ["EMP-006", "EMP-005", "H1-2025", 4.1, "Delivered timely monthly reporting packs.", "draft", null],
  ["EMP-007", "EMP-005", "FY2024", 3.6, "Good discipline with client billing cycles.", "submitted", "2025-01-19T09:10:00Z"],
  ["EMP-008", "EMP-001", "FY2024", 4.3, "Improved portfolio risk governance.", "acknowledged", "2025-01-17T14:20:00Z"],
  ["EMP-009", "EMP-008", "FY2023", 3.7, "Solid credit memo preparation and follow-through.", "submitted", "2024-01-25T08:00:00Z"],
  ["EMP-009", "EMP-008", "FY2024", 4.0, "Sharper client analysis and escalation judgment.", "acknowledged", "2025-01-23T08:30:00Z"],
  ["EMP-010", "EMP-008", "H1-2025", 3.5, "Growing confidence in lender covenant reviews.", "draft", null],
  ["EMP-011", "EMP-001", "FY2024", 4.5, "Strong technical leadership and mentoring.", "acknowledged", "2025-01-15T15:45:00Z"],
  ["EMP-012", "EMP-011", "FY2024", 4.1, "Dependable engineering execution on integrations.", "submitted", "2025-01-21T09:55:00Z"],
  ["EMP-013", "EMP-011", "FY2023", 3.4, "Good delivery with some quality consistency gaps.", "acknowledged", "2024-01-26T10:15:00Z"],
  ["EMP-013", "EMP-011", "H1-2025", 3.9, "Better code review participation and ownership.", "draft", null],
  ["EMP-014", "EMP-001", "FY2024", 4.6, "Excellent client stewardship in fiduciary operations.", "acknowledged", "2025-01-18T10:40:00Z"],
  ["EMP-015", "EMP-014", "FY2024", 4.0, "Good progress in trust administration processes.", "submitted", "2025-01-24T11:25:00Z"]
] as const;

const loginAccounts = [
  { employee_number: "EMP-002", username: "jean.lagesse", password: "Password123!" },
  { employee_number: "EMP-005", username: "marie.delannoy", password: "Password123!" },
  { employee_number: "EMP-008", username: "rishi.goburdhun", password: "Password123!" },
  { employee_number: "EMP-011", username: "anisha.rughooputh", password: "Password123!" },
  { employee_number: "EMP-014", username: "farida.oozeer", password: "Password123!" }
] as const;

async function getIdMap(
  knex: Knex,
  table: string,
  keyColumn: string
): Promise<RecordMap> {
  const rows = await knex(table).select("id", keyColumn);
  return rows.reduce<RecordMap>((accumulator, row) => {
    accumulator[String(row[keyColumn])] = Number(row.id);
    return accumulator;
  }, {});
}

async function ensureInsert(
  knex: Knex,
  table: string,
  match: Record<string, unknown>,
  payload: Record<string, unknown>
) {
  const existing = await knex(table).where(match).first("id");
  if (!existing) {
    await knex(table).insert(payload);
  }
}

export async function seed(knex: Knex): Promise<void> {
  await knex("entities")
    .insert(entities)
    .onConflict("registration_number")
    .ignore();

  const entityIds = await getIdMap(knex, "entities", "registration_number");

  await knex("companies")
    .insert(
      companies.map((company) => ({
        entity_id: entityIds[company.entity_registration],
        name: company.name,
        company_code: company.company_code,
        industry: company.industry,
        is_active: true
      }))
    )
    .onConflict("company_code")
    .ignore();

  const companyIds = await getIdMap(knex, "companies", "company_code");

  await knex("departments")
    .insert(
      departments.map((department) => ({
        company_id: companyIds[department.company_code],
        name: department.name,
        code: department.code,
        is_active: true
      }))
    )
    .onConflict(["company_id", "code"])
    .ignore();

  await knex("job_grades").insert(jobGrades).onConflict("code").ignore();

  const gradeIds = await getIdMap(knex, "job_grades", "code");

  await knex("job_titles")
    .insert(
      jobTitles.map((jobTitle) => ({
        title: jobTitle.title,
        job_grade_id: gradeIds[jobTitle.grade_code],
        department_code: jobTitle.department_code
      }))
    )
    .onConflict("title")
    .ignore();

  const jobTitleIds = await getIdMap(knex, "job_titles", "title");
  const departmentRows = await knex("departments")
    .join("companies", "departments.company_id", "companies.id")
    .select("departments.id", "departments.code", "companies.company_code");
  const departmentIds = departmentRows.reduce<RecordMap>((accumulator, row) => {
    accumulator[`${row.company_code}:${row.code}`] = Number(row.id);
    return accumulator;
  }, {});

  for (const employee of employees) {
    const existing = await knex("employees")
      .where({ employee_number: employee.employee_number })
      .first("id");

    if (!existing) {
      await knex("employees").insert({
        entity_id: entityIds[employee.entity_registration],
        company_id: companyIds[employee.company_code],
        department_id: departmentIds[`${employee.company_code}:${employee.department_code}`],
        job_title_id: jobTitleIds[employee.job_title],
        employee_number: employee.employee_number,
        first_name: employee.first_name,
        last_name: employee.last_name,
        email: employee.email,
        phone: employee.phone,
        date_of_birth: employee.date_of_birth,
        date_joined: employee.date_joined,
        employment_type: employee.employment_type,
        is_active: employee.is_active
      });
    }
  }

  const employeeIds = await getIdMap(knex, "employees", "employee_number");

  for (const employee of employees) {
    await knex("employees")
      .where({ employee_number: employee.employee_number })
      .update({
        manager_id: employee.manager_employee_number
          ? employeeIds[employee.manager_employee_number]
          : null,
        updated_at: knex.fn.now()
      });
  }

  for (const historyRecord of employmentHistory) {
    await ensureInsert(
      knex,
      "employment_history",
      {
        employee_id: employeeIds[historyRecord.employee_number],
        effective_from: historyRecord.effective_from,
        job_title_id: jobTitleIds[historyRecord.job_title]
      },
      {
        employee_id: employeeIds[historyRecord.employee_number],
        company_id: companyIds[historyRecord.company_code],
        department_id: departmentIds[`${historyRecord.company_code}:${historyRecord.department_code}`],
        job_title_id: jobTitleIds[historyRecord.job_title],
        effective_from: historyRecord.effective_from,
        effective_to: historyRecord.effective_to,
        change_reason: historyRecord.change_reason
      }
    );
  }

  await knex("leave_types").insert(leaveTypes).onConflict("name").ignore();
  const leaveTypeIds = await getIdMap(knex, "leave_types", "name");

  for (const [employeeNumber, leaveType, startDate, endDate, daysTaken, status, approvedBy] of leaveRecords) {
    await ensureInsert(
      knex,
      "leave_records",
      {
        employee_id: employeeIds[employeeNumber],
        leave_type_id: leaveTypeIds[leaveType],
        start_date: startDate
      },
      {
        employee_id: employeeIds[employeeNumber],
        leave_type_id: leaveTypeIds[leaveType],
        start_date: startDate,
        end_date: endDate,
        days_taken: daysTaken,
        status,
        approved_by: employeeIds[approvedBy]
      }
    );
  }

  for (const [employeeNumber, effectiveFrom, grossSalary] of payrollRecords) {
    await ensureInsert(
      knex,
      "payroll",
      {
        employee_id: employeeIds[employeeNumber],
        effective_from: effectiveFrom
      },
      {
        employee_id: employeeIds[employeeNumber],
        effective_from: effectiveFrom,
        effective_to: null,
        gross_salary: grossSalary,
        currency: "MUR",
        pay_frequency: "monthly",
        bank_name: "Mauritius Commercial Bank",
        bank_account: `000${employeeIds[employeeNumber]}452198`
      }
    );
  }

  for (const [employeeNumber, reviewerNumber, reviewPeriod, rating, comments, status, submittedAt] of performanceReviews) {
    await ensureInsert(
      knex,
      "performance_reviews",
      {
        employee_id: employeeIds[employeeNumber],
        review_period: reviewPeriod
      },
      {
        employee_id: employeeIds[employeeNumber],
        reviewer_id: employeeIds[reviewerNumber],
        review_period: reviewPeriod,
        rating,
        comments,
        status,
        submitted_at: submittedAt
      }
    );
  }

  for (const account of loginAccounts) {
    const existing = await knex("credentials")
      .where({ username: account.username })
      .orWhere({ employee_number: account.employee_number })
      .first("id");

    if (!existing) {
      await knex("credentials").insert({
        employee_number: account.employee_number,
        username: account.username,
        password_hash: await bcrypt.hash(account.password, 10)
      });
    }
  }
}
