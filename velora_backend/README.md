# Ecommerce Demo Backend

Mock REST API backend for the Velora ecommerce platform used by Lena during local development and dissertation demos.

## Stack

- Node.js
- Express
- TypeScript
- PostgreSQL
- Knex

## Setup

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

The service runs on `http://localhost:4001`.

## Environment

```env
DATABASE_URL=
API_KEY=
PORT=4001
```

## Scripts

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run db:migrate`
- `npm run db:migrate:rollback`
- `npm run db:seed`

## Auth

All `/api/v1/*` routes except `/api/v1/auth/login` require:

```http
VELORA_API_KEY: your-api-key
```

`X-API-Key` is also accepted for convenience during manual testing.

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

See [API_DOCUMENTATION.md](/Users/Ken/Documents/UG%20project/retail-ai-assistant/backend/velora_backend/API_DOCUMENTATION.md) for the endpoint contract.
