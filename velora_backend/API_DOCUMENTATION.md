# Aletia Backend API Documentation

## Overview

The Aletia HR Platform backend is a mock REST API designed for demo and development use. It exposes HR-related data for employees, leave, payroll, performance reviews, employment history, and service health.

Base URL:

```text
http://localhost:4001
```

API version prefix:

```text
/api/v1
```

## Authentication

All `/api/v1` endpoints require an API key in the `X-API-Key` header.

Example:

```http
X-API-Key: aletia-demo-key-2024
```

If the header is missing or invalid, the API returns:

```json
{
  "error": "unauthorized",
  "message": "Invalid or missing API key"
}
```

Status code:

```text
401 Unauthorized
```

## Content Type

All responses are JSON.

## Pagination

All list endpoints support pagination with:

```text
page=1
limit=50
```

Defaults and rules:

- Default `page`: `1`
- Default `limit`: `50`
- Maximum `limit`: `200`

Standard list response format:

```json
{
  "data": [],
  "meta": {
    "total": 0,
    "page": 1,
    "limit": 50,
    "pages": 0
  }
}
```

Standard single-record response format:

```json
{
  "data": {}
}
```

Standard error response format:

```json
{
  "error": "error_code",
  "message": "human readable message"
}
```

## Computed Fields

- `full_name` is computed as `first_name + " " + last_name`
- `status` is:
  - `active` when `is_active = true` and `date_left IS NULL`
  - `inactive` when `is_active = false` or `date_left IS NOT NULL`

## Health Endpoint

### GET `/health`

Returns the service health status. No authentication required.

Example request:

```bash
curl http://localhost:4001/health
```

Example response:

```json
{
  "status": "ok",
  "service": "Aletia HR Platform",
  "timestamp": "2026-03-24T12:00:00.000Z"
}
```

## Employee Endpoints

### GET `/api/v1/employees`

Returns a paginated list of employees.

Query parameters:

- `department_id` integer
- `department_name` string
- `company_id` integer
- `entity_id` integer
- `manager_id` integer
- `employment_type` string: `permanent | contract | intern`
- `status` string: `active | inactive`
- `date_joined_from` date: `YYYY-MM-DD`
- `date_joined_to` date: `YYYY-MM-DD`
- `page` integer
- `limit` integer

Example request:

```bash
curl -H "X-API-Key: aletia-demo-key-2024" \
  "http://localhost:4001/api/v1/employees?status=active&page=1&limit=5"
```

Response fields per employee:

- `id`
- `employee_number`
- `first_name`
- `last_name`
- `full_name`
- `email`
- `phone`
- `job_title`
- `job_grade`
- `department`
- `company`
- `entity`
- `employment_type`
- `status`
- `date_joined`
- `manager_id`
- `manager_name`

Does not return:

- `date_of_birth`

Example response:

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

### GET `/api/v1/employees/:employee_number`

Returns a single employee by employee number.

Path parameters:

- `employee_number` string, for example `EMP-001`

Example request:

```bash
curl -H "X-API-Key: aletia-demo-key-2024" \
  "http://localhost:4001/api/v1/employees/EMP-001"
```

Example response:

```json
{
  "data": {
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
}
```

Returns `404` if the employee is not found.

### GET `/api/v1/employees/:employee_number/summary`

Returns a lightweight employee profile.

Response fields:

- `employee_number`
- `full_name`
- `job_title`
- `department`
- `company`
- `email`
- `status`

Example request:

```bash
curl -H "X-API-Key: aletia-demo-key-2024" \
  "http://localhost:4001/api/v1/employees/EMP-001/summary"
```

Example response:

```json
{
  "data": {
    "employee_number": "EMP-001",
    "full_name": "Priya Ramdhani",
    "job_title": "HR Admin",
    "department": "Human Resources",
    "company": "Rogers Capital Ltd",
    "email": "priya.ramdhani@rogerscapital.mu",
    "status": "active"
  }
}
```

## Leave Endpoints

### GET `/api/v1/leave`

Returns leave records.

Query parameters:

- `employee_id` integer
- `employee_number` string
- `department_id` integer
- `department_name` string
- `leave_type` string
- `status` string: `pending | approved | rejected`
- `date_from` date: `YYYY-MM-DD`
- `date_to` date: `YYYY-MM-DD`
- `page` integer
- `limit` integer

Example request:

```bash
curl -H "X-API-Key: aletia-demo-key-2024" \
  "http://localhost:4001/api/v1/leave?employee_number=EMP-003&limit=10"
```

Response fields per record:

- `id`
- `employee_number`
- `full_name`
- `leave_type`
- `start_date`
- `end_date`
- `days_taken`
- `status`
- `approved_by_name`
- `created_at`

Example response:

```json
{
  "data": [
    {
      "id": 2,
      "employee_number": "EMP-003",
      "full_name": "Nathalie Begue",
      "leave_type": "sick",
      "start_date": "2025-01-09",
      "end_date": "2025-01-10",
      "days_taken": "2.0",
      "status": "approved",
      "approved_by_name": "Jean-Michel Lagesse",
      "created_at": "2026-03-24T09:10:00.000Z"
    }
  ],
  "meta": {
    "total": 2,
    "page": 1,
    "limit": 10,
    "pages": 1
  }
}
```

### GET `/api/v1/leave/balance/:employee_number`

Returns leave balance totals for a specific employee.

Example request:

```bash
curl -H "X-API-Key: aletia-demo-key-2024" \
  "http://localhost:4001/api/v1/leave/balance/EMP-003"
```

Example response:

```json
{
  "data": {
    "employee_number": "EMP-003",
    "full_name": "Nathalie Begue",
    "balances": {
      "annual": {
        "entitled": 22,
        "taken": 3,
        "remaining": 19
      },
      "sick": {
        "entitled": 15,
        "taken": 2,
        "remaining": 13
      },
      "maternity": {
        "entitled": 84,
        "taken": 0,
        "remaining": 84
      },
      "paternity": {
        "entitled": 5,
        "taken": 0,
        "remaining": 5
      },
      "unpaid": {
        "entitled": null,
        "taken": 0,
        "remaining": null
      }
    }
  }
}
```

Returns `404` if the employee is not found.

## Payroll Endpoints

### GET `/api/v1/payroll`

Returns current payroll records for multiple employees.

Query parameters:

- `department_id` integer
- `department_name` string
- `company_id` integer
- `page` integer
- `limit` integer

Example request:

```bash
curl -H "X-API-Key: aletia-demo-key-2024" \
  "http://localhost:4001/api/v1/payroll?company_id=1"
```

Response fields:

- `employee_number`
- `full_name`
- `gross_salary`
- `currency`
- `pay_frequency`
- `effective_from`
- `job_grade`
- `department`

Never returned:

- `bank_account`
- `bank_name`

Example response:

```json
{
  "data": [
    {
      "employee_number": "EMP-011",
      "full_name": "Anisha Rughooputh",
      "gross_salary": "118000.00",
      "currency": "MUR",
      "pay_frequency": "monthly",
      "effective_from": "2022-10-01",
      "job_grade": "G4",
      "department": "Technology"
    }
  ],
  "meta": {
    "total": 15,
    "page": 1,
    "limit": 50,
    "pages": 1
  }
}
```

### GET `/api/v1/payroll/:employee_number`

Returns the current payroll record for a specific employee.

Example request:

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

Returns `404` if no current payroll record is found.

## Performance Endpoints

### GET `/api/v1/performance`

Returns performance review records.

Query parameters:

- `employee_id` integer
- `employee_number` string
- `reviewer_id` integer
- `review_period` string, for example `FY2024`
- `status` string: `draft | submitted | acknowledged`
- `department_id` integer
- `department_name` string
- `page` integer
- `limit` integer

Example request:

```bash
curl -H "X-API-Key: aletia-demo-key-2024" \
  "http://localhost:4001/api/v1/performance?review_period=FY2024"
```

Response fields per record:

- `id`
- `employee_number`
- `full_name`
- `review_period`
- `rating`
- `status`
- `reviewer_name`
- `submitted_at`
- `comments`

Example response:

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

### GET `/api/v1/performance/:employee_number`

Returns all performance reviews for a specific employee.

Example request:

```bash
curl -H "X-API-Key: aletia-demo-key-2024" \
  "http://localhost:4001/api/v1/performance/EMP-013"
```

Example response:

```json
{
  "data": [
    {
      "id": 16,
      "employee_number": "EMP-013",
      "full_name": "Thierry Meunier",
      "review_period": "H1-2025",
      "rating": "3.9",
      "status": "draft",
      "reviewer_name": "Anisha Rughooputh",
      "submitted_at": null,
      "comments": "Better code review participation and ownership."
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

Returns `404` if the employee is not found.

## Employment History Endpoints

### GET `/api/v1/history/:employee_number`

Returns employment history for a specific employee.

Query parameters:

- `date_from` date
- `date_to` date
- `change_reason` string

Example request:

```bash
curl -H "X-API-Key: aletia-demo-key-2024" \
  "http://localhost:4001/api/v1/history/EMP-011"
```

Response fields per record:

- `id`
- `employee_number`
- `full_name`
- `job_title`
- `department`
- `company`
- `effective_from`
- `effective_to`
- `change_reason`

Example response:

```json
{
  "data": [
    {
      "id": 15,
      "employee_number": "EMP-011",
      "full_name": "Anisha Rughooputh",
      "job_title": "Tech Lead",
      "department": "Technology",
      "company": "Rogers Capital Technology Ltd",
      "effective_from": "2022-10-01",
      "effective_to": null,
      "change_reason": "promotion"
    },
    {
      "id": 14,
      "employee_number": "EMP-011",
      "full_name": "Anisha Rughooputh",
      "job_title": "Software Developer",
      "department": "Technology",
      "company": "Rogers Capital Technology Ltd",
      "effective_from": "2019-05-20",
      "effective_to": "2022-09-30",
      "change_reason": "initial"
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

Returns `404` if the employee is not found.

## Error Handling

The API uses consistent JSON error responses.

### 400 Bad Request

Returned when a query parameter has an invalid format.

Example:

```json
{
  "error": "bad_request",
  "message": "Invalid page: expected an integer"
}
```

### 401 Unauthorized

Returned when the API key is missing or invalid.

```json
{
  "error": "unauthorized",
  "message": "Invalid or missing API key"
}
```

### 404 Not Found

Returned when a resource cannot be found.

```json
{
  "error": "not_found",
  "message": "Employee not found"
}
```

### 422 Unprocessable Entity

Returned when a filter combination is invalid.

```json
{
  "error": "invalid_filter_combination",
  "message": "Invalid date_joined range: from date cannot be after to date"
}
```

### 500 Internal Server Error

Returned for unhandled server errors.

```json
{
  "error": "internal_server_error",
  "message": "An unexpected error occurred"
}
```

## Notes

- All dates use ISO `YYYY-MM-DD` format where applicable.
- Currency amounts are stored in MUR.
- Payroll queries intentionally do not select `bank_name` or `bank_account`.
- Request logging records method, path, status code, and response time for every request.
