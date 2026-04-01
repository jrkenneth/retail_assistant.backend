const QUERYDB_SKILL_INSTRUCTIONS = `
SKILL: query_db
DOMAIN COVERED: hr (Aletia HR Platform)

You may query HR data using the execute_query tool
with domain: "hr".
You may also create access escalation tickets using
domain: "rbac", intent: "create_access_request" when the
user explicitly asks you to raise an access request after
being denied access.

Never fabricate, infer, or guess values - use only what
the API returns.

Never invent identifiers such as department_id,
employee_number, employee_id, manager_id, reviewer_id,
company_id, entity_id, or status codes.

If a required parameter is missing for the specific intent you
have chosen, first check whether another supported intent can
resolve the request with the information the user already gave.
For employee requests where the user provides a name but not an
employee_number, first use query_employees with full_name,
first_name, or last_name before asking the user for an employee
number. Ask for employee_number only if the selected intent truly
requires it and no supported name-based lookup can resolve the
request.
If a required identifier is still missing and cannot be resolved
from a supported lookup or name-based filter, ask the user
instead of guessing.

When the user provides a department name such as "Finance",
prefer department_name filters over guessing a numeric
department_id.

All dates must be passed in YYYY-MM-DD format.

Currency amounts must be returned with their currency code.
Example: "MUR 85,000" not "85000".

When a query returns no results, say so clearly.
Never suggest data exists when it does not.

Apply a sensible limit to all list queries unless the user
explicitly asks for all records. Default limit: 50.

============================================================
DOMAIN: hr
Source: Aletia HR Platform (via internal adapter)
============================================================

----------------------------------------
INTENT: query_employees
----------------------------------------
Description:
  Retrieve employee records. Use for any request involving
  listing, finding, or describing employees - by department,
  role, status, manager, or individually.

params (path-level, include when querying a specific employee):
  employee_number     string    - e.g. "EMP-001"

filters (query-level, all optional):
  first_name          string    - partial match on first name
  last_name           string    - partial match on last name
  full_name           string    - partial match on full name
  department_id       integer
  department_name     string    - partial match on department name
  company_id          integer
  entity_id           integer
  manager_id          integer
  employment_type     string    - "permanent" | "contract" | "intern"
  status              string    - "active" | "inactive"
  date_joined_from    date      - YYYY-MM-DD
  date_joined_to      date      - YYYY-MM-DD
  limit               integer   - default 50, max 200
  page                integer   - default 1

Example calls:
  "List all employees"
  -> intent: query_employees
  -> params: {}
  -> filters: { status: "active", limit: 50 }

  "Show me employee EMP-007"
  -> intent: get_employee_profile
  -> params: { employee_number: "EMP-007" }
  -> filters: {}

  "Show me employee Vikash Foolchand"
  -> intent: query_employees
  -> params: {}
  -> filters: { full_name: "Vikash Foolchand", limit: 50 }

  "Show me the profile of Vikash Foolchand"
  -> intent: query_employees
  -> params: {}
  -> filters: { full_name: "Vikash Foolchand", limit: 50 }

  "List all employees in the Finance department"
  -> intent: query_employees
  -> params: {}
  -> filters: { department_name: "Finance", status: "active" }

  "Who are the direct reports of EMP-002?"
  -> intent: query_employees
  -> params: {}
  -> filters: { manager_id: <id> }

  "Show me all employees named Priya"
  -> intent: query_employees
  -> params: {}
  -> filters: { first_name: "Priya" }

----------------------------------------
INTENT: get_employee_profile
----------------------------------------
Description:
  Retrieve full profile for a single employee by
  employee_number. If the user gives only a name, resolve the
  employee first with query_employees, then use the returned
  employee_number if a full profile is still needed.

params:
  employee_number     string    REQUIRED - e.g. "EMP-001"

filters: none

Example call:
  "Show me the profile of EMP-005"
  -> intent: get_employee_profile
  -> params: { employee_number: "EMP-005" }
  -> filters: {}

----------------------------------------
INTENT: get_employee_summary
----------------------------------------
Description:
  Retrieve a lightweight summary for a single employee.
  Use when only basic info is needed
  (name, title, department, email, status).

params:
  employee_number     string    REQUIRED

filters: none

----------------------------------------
INTENT: query_leave
----------------------------------------
Description:
  Retrieve leave records. Use for requests about leave
  history, leave taken, pending approvals, or leave within
  a date range.

params: none

filters (all optional):
  employee_id         integer
  employee_number     string
  first_name          string    - partial match on first name
  last_name           string    - partial match on last name
  full_name           string    - partial match on full name
  department_id       integer
  department_name     string    - partial match on department name
  leave_type          string    - "annual"|"sick"|"maternity"|
                                  "paternity"|"unpaid"
  status              string    - "pending"|"approved"|"rejected"
  date_from           date      - YYYY-MM-DD
  date_to             date      - YYYY-MM-DD
  limit               integer
  page                integer

Example calls:
  "Show me all pending leave requests"
  -> intent: query_leave
  -> params: {}
  -> filters: { status: "pending" }

  "How much sick leave did EMP-003 take in 2025?"
  -> intent: query_leave
  -> params: {}
  -> filters: {
      employee_number: "EMP-003",
      leave_type: "sick",
      date_from: "2025-01-01",
      date_to: "2025-12-31"
    }

  "Find leave records for Nathalie Begue"
  -> intent: query_leave
  -> params: {}
  -> filters: { full_name: "Nathalie Begue" }

----------------------------------------
INTENT: get_leave_balance
----------------------------------------
Description:
  Retrieve leave balance summary for a specific employee.
  Use when the user asks how many leave days remain,
  their leave entitlement, or their leave balance.

params:
  employee_number     string    REQUIRED

filters: none

Example call:
  "How many annual leave days does EMP-003 have left?"
  -> intent: get_leave_balance
  -> params: { employee_number: "EMP-003" }
  -> filters: {}

----------------------------------------
INTENT: query_payroll
----------------------------------------
Description:
  Retrieve payroll records for multiple employees.
  Use for department-wide or company-wide salary queries.

params: none

filters (all optional):
  first_name          string    - partial match on first name
  last_name           string    - partial match on last name
  full_name           string    - partial match on full name
  department_id       integer
  department_name     string    - partial match on department name
  company_id          integer
  limit               integer
  page                integer

Example call:
  "Show me payroll for the Finance department"
  -> intent: query_payroll
  -> params: {}
  -> filters: { department_name: "Finance" }

----------------------------------------
INTENT: get_employee_payroll
----------------------------------------
Description:
  Retrieve the current payroll record for a single employee.

params:
  employee_number     string    REQUIRED

filters: none

Example call:
  "What is EMP-011's salary?"
  -> intent: get_employee_payroll
  -> params: { employee_number: "EMP-011" }
  -> filters: {}

----------------------------------------
INTENT: create_access_request
----------------------------------------
Description:
  Create an RBAC access escalation ticket only when the
  user explicitly confirms they want you to raise one
  after access has been denied.

domain:
  "rbac"

params:
  requested_by        string    REQUIRED
  resource_requested  string    REQUIRED
  justification       string    REQUIRED

----------------------------------------
INTENT: query_performance
----------------------------------------
Description:
  Retrieve performance review records. Use for requests
  about ratings, review history, review status, or
  reviews for a specific period.

params: none

filters (all optional):
  employee_id         integer
  employee_number     string
  first_name          string    - partial match on first name
  last_name           string    - partial match on last name
  full_name           string    - partial match on full name
  reviewer_id         integer
  review_period       string    - e.g. "FY2024", "H1-2025"
  status              string    - "draft"|"submitted"|"acknowledged"
  department_id       integer
  department_name     string    - partial match on department name
  limit               integer
  page                integer

Example calls:
  "Show me all FY2024 performance reviews"
  -> intent: query_performance
  -> params: {}
  -> filters: { review_period: "FY2024" }

  "Show me submitted reviews for EMP-007"
  -> intent: query_performance
  -> params: {}
  -> filters: { employee_number: "EMP-007", status: "submitted" }

----------------------------------------
INTENT: get_employee_performance
----------------------------------------
Description:
  Retrieve all performance reviews for a specific employee.

params:
  employee_number     string    REQUIRED

filters (optional):
  page                integer
  limit               integer

Example call:
  "Show me EMP-013's performance history"
  -> intent: get_employee_performance
  -> params: { employee_number: "EMP-013" }
  -> filters: {}

----------------------------------------
INTENT: get_employment_history
----------------------------------------
Description:
  Retrieve employment history (role and department movements)
  for a specific employee. Use for career progression,
  past roles, transfers, or promotions.

params:
  employee_number     string    REQUIRED

filters (all optional):
  date_from           date      - YYYY-MM-DD
  date_to             date      - YYYY-MM-DD
  change_reason       string    - "promotion"|"transfer"|
                                  "restructure"|"initial"
  page                integer
  limit               integer

Example call:
  "Show me the career history of EMP-011"
  -> intent: get_employment_history
  -> params: { employee_number: "EMP-011" }
  -> filters: {}

----------------------------------------
INTENT: health_check
----------------------------------------
Description:
  Check if the Aletia HR service is available.
  Use when the user asks if the HR system is up or
  when a previous query failed unexpectedly.

params: none
filters: none
`.trim();

export type SkillName = "web_research" | "artefact_design" | "querydb";

export const VALID_SKILL_NAMES = new Set<string>([
  "web_research",
  "artefact_design",
  "querydb",
]);

export type SkillEntry = {
  description: string;
  instructions: string;
};

export const skillRegistry: Record<SkillName, SkillEntry> = {
  web_research: {
    description: "Gather current external information using search_api and return citation-grounded responses.",
    instructions: `
Use search_api for external research tasks.
- Use targeted queries and stop once evidence is sufficient.
- Cite factual claims supported by tool output.
- If sources conflict, report the conflict clearly.
- If results are insufficient, state that explicitly.
`.trim(),
  },

  artefact_design: {
    description: "Produce structured document artefacts matching the requested format.",
    instructions: `
Choose the document type that matches user intent.
- pptx for decks, docx for narrative reports, xlsx for tabular deliverables, pdf for styled visual docs, txt for plain text.
- Return content schema that matches artifact type.
- Keep structure audience-aware and concise.
`.trim(),
  },

  querydb: {
    description: "Query Aletia HR data and service health, including employee, leave, payroll, performance, history, and Aletia availability checks.",
    instructions: QUERYDB_SKILL_INSTRUCTIONS,
  },
};

export const skillSummaryLines = Object.entries(skillRegistry)
  .map(([name, entry]) => `- ${name}: ${entry.description}`)
  .join("\n");
