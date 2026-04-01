# Velora Backend

Mock REST API backend for the Velora ecommerce demo.

## Stack

- Node.js
- Express.js
- TypeScript
- PostgreSQL
- Knex.js

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create an environment file from the example:

```bash
cp .env.example .env
```

3. Update the PostgreSQL connection values in `.env` if needed.

4. Run migrations and seed data:

```bash
npm run migrate
npm run seed
```

5. Start the API:

```bash
npm run dev
```

The service runs on `http://localhost:4001`.

## Environment Variables

```env
PORT=4001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=velora_demo
DB_USER=postgres
DB_PASSWORD=
ALETIA_API_KEY=aletia-demo-key-2024
```

## Migrations And Seeds

- Run migrations: `npm run migrate`
- Roll back last migration batch: `npm run migrate:rollback`
- Seed data: `npm run seed`

The seed is idempotent and can be re-run safely.

## Authentication

All `/api/v1/*` routes require:

```http
X-API-Key: aletia-demo-key-2024
```

If the key is missing or invalid, the API returns:

```json
{
  "error": "unauthorized",
  "message": "Invalid or missing API key"
}
```

## Endpoints

### Health

```bash
curl http://localhost:4001/health
```

Example response:

```json
{
  "status": "ok",
  "service": "Velora Backend",
  "timestamp": "2026-03-24T12:00:00.000Z"
}
```

### Employees

List employees:

```bash
curl -H "X-API-Key: aletia-demo-key-2024" \
  "http://localhost:4001/api/v1/employees?page=1&limit=5&status=active"
```

Get one employee:

```bash
curl -H "X-API-Key: aletia-demo-key-2024" \
  "http://localhost:4001/api/v1/employees/EMP-001"
```

Get employee summary:

```bash
curl -H "X-API-Key: aletia-demo-key-2024" \
  "http://localhost:4001/api/v1/employees/EMP-001/summary"
```

Example list response:

```json
{
  "data": [
    {
      "id": 1,
      "employee_number": "EMP-001",
      "first_name": "Priya",
      "last_name": "Ramdhani",
      "full_name": "Priya Ramdhani",
      "email": "priya.ramdhani@rogerscapital.mu",
      "phone": "+23052541001",
      "job_title": "HR Admin",
      "job_grade": "G6",
      "department": "Human Resources",
      "company": "Rogers Capital Ltd",
      "entity": "Rogers Capital Ltd",
      "employment_type": "permanent",
      "status": "active",
      "date_joined": "2018-01-15",
      "manager_id": null,
      "manager_name": null
    }
  ],
  "meta": {
    "total": 15,
    "page": 1,
    "limit": 5,
    "pages": 3
  }
}
```

### Leave

List leave records:

```bash
curl -H "X-API-Key: aletia-demo-key-2024" \
  "http://localhost:4001/api/v1/leave?employee_number=EMP-003&limit=10"
```

Get leave balance:

```bash
curl -H "X-API-Key: aletia-demo-key-2024" \
  "http://localhost:4001/api/v1/leave/balance/EMP-003"
```

Example balance response:

```json
{
  "data": {
    "employee_number": "EMP-003",
    "full_name": "Nathalie Begue",
    "balances": {
      "annual": { "entitled": 22, "taken": 3, "remaining": 19 },
      "sick": { "entitled": 15, "taken": 2, "remaining": 13 },
      "maternity": { "entitled": 84, "taken": 0, "remaining": 84 },
      "paternity": { "entitled": 5, "taken": 0, "remaining": 5 },
      "unpaid": { "entitled": null, "taken": 0, "remaining": null }
    }
  }
}
```

### Payroll

List payroll records:

```bash
curl -H "X-API-Key: aletia-demo-key-2024" \
  "http://localhost:4001/api/v1/payroll?company_id=1"
```

Get payroll for one employee:

```bash
curl -H "X-API-Key: aletia-demo-key-2024" \
  "http://localhost:4001/api/v1/payroll/EMP-011"
```

Example response:

```json
{
  "data": {
    "employee_number": "EMP-011",
    "full_name": "Anisha Rughooputh",
    "gross_salary": "118000.00",
    "currency": "MUR",
    "pay_frequency": "monthly",
    "effective_from": "2022-10-01",
    "job_grade": "G4",
    "department": "Technology"
  }
}
```

### Performance

List performance reviews:

```bash
curl -H "X-API-Key: aletia-demo-key-2024" \
  "http://localhost:4001/api/v1/performance?review_period=FY2024"
```

Get performance history for one employee:

```bash
curl -H "X-API-Key: aletia-demo-key-2024" \
  "http://localhost:4001/api/v1/performance/EMP-013"
```

Example list response:

```json
{
  "data": [
    {
      "id": 14,
      "employee_number": "EMP-012",
      "full_name": "Dominique Fontaine",
      "review_period": "FY2024",
      "rating": "4.1",
      "status": "submitted",
      "reviewer_name": "Anisha Rughooputh",
      "submitted_at": "2025-01-21T09:55:00.000Z",
      "comments": "Dependable engineering execution on integrations."
    }
  ],
  "meta": {
    "total": 18,
    "page": 1,
    "limit": 50,
    "pages": 1
  }
}
```

### Employment History

```bash
curl -H "X-API-Key: aletia-demo-key-2024" \
  "http://localhost:4001/api/v1/history/EMP-011"
```

Example response:

```json
{
  "data": [
    {
      "id": 14,
      "employee_number": "EMP-011",
      "full_name": "Anisha Rughooputh",
      "job_title": "Tech Lead",
      "department": "Technology",
      "company": "Rogers Capital Technology Ltd",
      "effective_from": "2022-10-01",
      "effective_to": null,
      "change_reason": "promotion"
    }
  ],
  "meta": {
    "total": 2,
    "page": 1,
    "limit": 2,
    "pages": 1
  }
}
```

## Errors

Example not-found response:

```json
{
  "error": "not_found",
  "message": "Resource not found"
}
```

Example internal error response:

```json
{
  "error": "internal_server_error",
  "message": "An unexpected error occurred"
}
```
