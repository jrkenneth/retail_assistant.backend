# Backend (Lena API)

Express + TypeScript backend for Lena. This service handles authentication, chat orchestration, RBAC enforcement, tool execution, persistence, artifacts, and audit logging.

## Role in the System

- Authenticates users and issues JWTs.
- Owns chat sessions/messages and request traces.
- Runs the LLM planner/agent loop.
- Executes tools with deterministic guardrails (instead of direct model data access).
- Enforces customer scope and field-level RBAC before returning data.
- Serves artifact metadata, preview, and download endpoints.
- Stores access requests and audit events.

## Prerequisites

- Node.js 18+
- PostgreSQL (local or remote)
- Velora demo backend running (default: `http://localhost:4001`)
- LLM credentials (OpenAI-compatible or Google)
- Optional Tavily API key for research mode web search

## Environment Setup

1. Copy the example file:

```bash
cp .env.example .env
```

2. Update required secrets and connection strings in `.env`.

Minimum required to boot reliably:

- `DATABASE_URL`
- `JWT_SECRET`
- `LLM_PROVIDER`, `LLM_MODEL`, and provider API key
- `VELORA_API_URL` and `VELORA_API_KEY`

## Install

```bash
npm install
```

## Database Setup

Run migrations before starting the API:

```bash
npm run db:migrate
```

Optional commands:

```bash
npm run db:seed
npm run db:rollback
npm run db:make your_migration_name
```

If you are using policy retrieval, generate embeddings after migrations/seeds:

```bash
npm run rag:embed
```

## Run Locally

```bash
npm run dev
```

Default local URL:

```text
http://localhost:4000
```

## Build and Start

```bash
npm run build
npm run start
```

## Scripts

- `npm run dev` - Run API with live reload
- `npm run typecheck` - TypeScript check
- `npm run build` - Typecheck build step
- `npm run start` - Start API
- `npm run db:migrate` - Apply migrations
- `npm run db:rollback` - Rollback latest migration batch
- `npm run db:seed` - Run seed scripts
- `npm run rag:embed` - Build/update policy embeddings
- `npm run eval:adapter` - Adapter integration evaluation
- `npm run eval:rag` - RAG evaluation
- `npm run eval:scenarios` - End-to-end scenario evaluation

## Key API Endpoints

Public:

- `GET /health`
- `GET /health/db`
- `POST /api/auth/login`

Authenticated:

- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /chat`
- `POST /chat/stream`
- `GET /sessions`
- `POST /sessions`
- `GET /sessions/:sessionId/messages`
- `PATCH /sessions/:sessionId`
- `DELETE /sessions/:sessionId`
- `GET /artifacts`
- `GET /artifacts/:artifactId`
- `GET /artifacts/:artifactId/preview`
- `GET /artifacts/:artifactId/download`
- `GET /access-requests`
- `POST /access-requests`

## Project Structure

```text
src/
  accessRequests/      Access request sanitization
  adapters/ecommerce/  Velora API adapter
  agent/               Routing, planning, prompts, skills, tool registry
  artifacts/           Artifact generation and typing
  audit/               Audit event logging
  auth/                JWT and auth middleware
  chat/                Contracts, runtime policy, logging
  db/                  Knex client and repositories
  rbac/                Role and field-level policy
  routes/              Express route handlers
  tools/               Tool implementations
  types/               Shared typings

migrations/            Database migrations
seeds/                 Database seeds
storage/exports/       Generated artifact files
```

## Recommended Local Startup Order

1. Start PostgreSQL.
2. Start Velora backend from `backend/velora_backend`.
3. In this folder, run `npm run db:migrate`.
4. Start this backend with `npm run dev`.
5. Start frontend from `frontend`.

## Related Documentation

- `velora_backend/API_DOCUMENTATION.md`
