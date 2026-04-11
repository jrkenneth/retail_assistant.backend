# Ecommerce Demo Backend API Documentation

## Overview

This service simulates Velora's ecommerce platform for Lena. Base URL:

```text
http://localhost:4001
```

API prefix:

```text
/api/v1
```

## Authentication

All `/api/v1/*` endpoints except `/api/v1/auth/login` require an API key:

```http
VELORA_API_KEY: your-api-key
```

`X-API-Key` is also accepted.

## Standard Responses

List endpoints:

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

Single-record endpoints:

```json
{
  "data": {}
}
```

## Endpoints

### Auth

- `POST /api/v1/auth/login`

Request:

```json
{
  "username": "demo_customer",
  "password": "password123"
}
```

### Customers

- `GET /api/v1/customers/:customerNumber`
- `GET /api/v1/customers/:customerNumber/status`
- `GET /api/v1/customers/:customerNumber/loyalty`
- `GET /api/v1/customers/:customerNumber/loyalty/history?limit=20&page=1`

### Products

- `GET /api/v1/products?query=headphones&category=Audio&availability=in_stock&limit=10`
- `GET /api/v1/products/:sku`

### Orders

- `GET /api/v1/orders?customer_number=CUST-0001&status=shipped&limit=10`
- `GET /api/v1/orders/:orderNumber`
- `GET /api/v1/orders/:orderNumber/tracking`
- `GET /api/v1/orders/:orderNumber/items`

### Returns

- `POST /api/v1/returns`
- `GET /api/v1/returns/:returnNumber`

Create-return request:

```json
{
  "customer_number": "CUST-0001",
  "order_number": "ORD-00001",
  "reason": "Item arrived damaged"
}
```

### Support

- `POST /api/v1/support/tickets`
- `GET /api/v1/support/tickets/:ticketNumber`

Create-ticket request:

```json
{
  "customer_number": "CUST-0001",
  "order_number": "ORD-00001",
  "subject": "Delayed delivery investigation",
  "description": "Customer reports delivered status but no parcel received.",
  "priority": "high"
}
```

### Policies

- `GET /api/v1/policies`
- `GET /api/v1/policies/:policyKey`

### Health

- `GET /health`
