# Velora Demo Backend

Mock ecommerce REST API used by Lena for local development, integration tests, and dissertation demos.

## Role in the System

- Simulates customer, order, return, loyalty, support, and policy endpoints.
- Provides API-key protected routes consumed by Lena backend tools.
- Uses PostgreSQL with Knex migrations/seeds.

## Prerequisites

- Node.js 18+
- PostgreSQL

## Environment Setup

1. Copy the example file:

```bash
cp .env.example .env
```

2. Update DB credentials and API key as needed.

## Install and Run

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Default local URL:

```text
http://localhost:4001
```

## Scripts

- `npm run dev` - Run with live reload
- `npm run build` - Compile TypeScript
- `npm run start` - Run compiled server
- `npm run db:migrate` - Apply migrations
- `npm run db:migrate:rollback` - Rollback latest migration batch
- `npm run db:seed` - Run seed scripts

## Authentication

All `/api/v1/*` routes except `/api/v1/auth/login` require an API key.

Accepted headers:

- `VELORA_API_KEY: <your-key>`
- `X-API-Key: <your-key>`

## Active API Areas

- `POST /api/v1/auth/login`
- `GET /api/v1/customers/:customerNumber`
- `GET /api/v1/customers/:customerNumber/status`
- `GET /api/v1/customers/:customerNumber/loyalty`
- `GET /api/v1/customers/:customerNumber/loyalty/history`
- `GET /api/v1/products`
- `GET /api/v1/products/:sku`
- `GET /api/v1/orders`
- `GET /api/v1/orders/:orderNumber`
- `GET /api/v1/orders/:orderNumber/tracking`
- `GET /api/v1/orders/:orderNumber/items`
- `POST /api/v1/returns`
- `GET /api/v1/returns/:returnNumber`
- `POST /api/v1/support/tickets`
- `GET /api/v1/support/tickets/:ticketNumber`
- `GET /api/v1/policies`
- `GET /api/v1/policies/:policyKey`

## Related Documentation

- `API_DOCUMENTATION.md`
