# Backend

Express + TypeScript API for Lena. This service is the source of truth for authentication, chat orchestration, RBAC, session ownership, artifact generation, access requests, and audit-safe tool execution.

## What This Service Does

- Authenticates users against the Velora backend and issues JWTs
- Enforces login rate limiting and token revocation checks
- Protects all business routes with JWT middleware
- Persists chat sessions, messages, tool traces, artifacts, access requests, and audit events in PostgreSQL
- Runs the LLM-driven orchestration loop for chat requests
- Executes controlled tools instead of letting the model access data directly
- Applies deterministic server-side RBAC before any HR data reaches the model
- Streams assistant responses to the frontend
- Generates and serves document artifacts
- Supports session-scoped model thinking mode for Qwen via the OpenAI-compatible API path

## Architecture Summary

The backend is intentionally policy-first:

1. The frontend sends an authenticated request.
2. Express validates auth and route ownership.
3. The chat route validates the request body with Zod.
4. The agent loop routes the request, activates skills, plans next actions, and may call tools.
5. The `execute_query` tool enforces deterministic RBAC, scope overrides, post-query validation, and field-level sanitization.
6. The final assistant response, traces, and optional artifacts are stored.
7. The API returns JSON or NDJSON events back to the frontend.

This design keeps the LLM useful for reasoning and phrasing, but not authoritative for security or data governance.

## Current Feature Areas

- Health endpoints
- Authentication and JWT session management
- Session-scoped chat history
- Streaming chat responses
- Tool-based data querying through the Velora adapter path
- Deterministic RBAC and self-service access rules
- Access denied escalation to access requests
- Artifact generation and preview/download support
- Audit logging for access-denied and scope-violation events
- Qwen thinking toggle support through request-scoped model options

## Project Structure

```text
src/
  accessRequests/    Access-request sanitization helpers
  adapters/aletia/   Legacy adapter path to be replaced with Velora ecommerce integration
  agent/             Router, planner, system prompt, tool registry, model client
  artifacts/         Artifact generation and content types
  audit/             Audit logger
  auth/              JWT signing, verification, blacklist, middleware
  chat/              Request/response contracts, runtime policy, logging
  db/                Knex client and repositories
  rbac/              Role mapping and field/intent policy
  routes/            Express route handlers
  tools/             Tool implementations used by the agent
  types/             Global typing extensions such as Express request typings

migrations/          PostgreSQL schema migrations
storage/exports/     Generated artifact files
```

## Key Technologies

- Node.js
- Express
- TypeScript
- Zod
- Knex
- PostgreSQL
- LangChain
- OpenAI-compatible chat API integration
- Optional Google model support via LangChain

## Why These Technologies

- Express: simple, explicit request pipeline and middleware model
- TypeScript: safer orchestration logic and route contracts
- Zod: runtime validation for request and response shapes
- Knex + PostgreSQL: clear schema control and migration support
- LangChain: pragmatic orchestration wrapper without giving up server-side control
- OpenAI-compatible transport: flexibility to target Qwen and similar providers without rewriting the model layer

## Prerequisites

- Node.js 18+
- PostgreSQL running locally or reachable from `DATABASE_URL`
- Velora backend running locally, typically on `http://localhost:4001`
- A configured LLM provider
- Optional Tavily credentials if web research is enabled

## Install

```bash
npm install
```

## Environment Setup

Create a local env file:

```bash
copy .env.example .env
```

Important variables include:

```bash
DATABASE_URL=
NODE_ENV=development
PORT=4000
CORS_ORIGIN=http://localhost:5173
JWT_SECRET=replace-me-with-a-long-random-secret

LLM_PROVIDER=openai_compat
LLM_MODEL=Qwen/Qwen3-32B-TEE
LLM_API_KEY=
LLM_BASE_URL=https://llm.chutes.ai/v1/chat/completions

GEMINI_API_KEY=
GEMINI_MODEL=gemini-3-flash-preview

LANGCHAIN_API_KEY=
LANGCHAIN_PROJECT=copilot project
LANGCHAIN_TRACING_V2=true

AGENT_MAX_TOOL_CALLS=4
AGENT_MAX_PLANNING_ITERATIONS=2

SEARCH_PROVIDER=tavily
TAVILY_API_KEY=
SEARCH_TIMEOUT_MS=8000
SEARCH_MAX_RESULTS=5

ALETIA_API_URL=http://localhost:4001
ALETIA_API_KEY=aletia-demo-key-2024
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

## Database Commands

```bash
npm run db:migrate
npm run db:rollback
npm run db:make your_migration_name
```

Current schema areas include:

- chat sessions
- chat messages
- request traces
- artifacts
- access requests
- audit log

## API Overview

Public routes:

- `GET /health`
- `GET /health/db`
- `POST /api/auth/login`

Authenticated routes:

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

## Authentication and Session Model

- Users log in with Velora-backed credentials
- Lena issues a JWT carrying identity and mapped access role
- Login is rate-limited
- Logout revokes the current token via `jti` blacklist
- Protected routes require a valid, non-revoked token
- Chat sessions and attached data are scoped to the authenticated employee

## RBAC Model

RBAC is enforced inside the `execute_query` tool, not just by prompts.

The backend currently applies:

- role mapping from business identity to `employee`, `manager`, `hr_officer`, `finance_officer`, or `admin`
- stale identity-status revalidation through the Velora service on each tool execution
- intent allow-lists by role
- unconditional scope overrides for self-service, employee, and manager paths
- post-query ownership/scope validation
- field-level sanitization before the LLM sees the result

This ensures that the model cannot bypass data scope rules by hallucinating parameters or asking for hidden fields.

## Self-Service Rule

The backend currently includes an explicit self-service rule for selected intents such as:

- employee summary/profile
- leave balance
- leave history
- own payroll
- employment history

For those intents, the backend forcibly scopes `employee_number` to the logged-in user before the query runs and validates the returned data afterward.

## Access Requests

When RBAC blocks access, the frontend can raise an access request.

The backend:

- sanitizes request text
- stores the request in PostgreSQL
- exposes history only to the owning authenticated user

## Audit Logging

The backend logs operational security events such as:

- access denied decisions
- scope violations where LLM-supplied values were overridden

Audit data is server-managed and not exposed through agent tools.

## Model and Thinking Toggle

For OpenAI-compatible Qwen usage, the backend supports request-scoped thinking mode.

The chat request can pass `context.modes.thinking`, and the backend applies that consistently across:

- capability routing
- planner/final response generation
- automatic session title generation

For the Qwen OpenAI-compatible path, the backend sends:

- `chat_template_kwargs.enable_thinking = true|false`

It also adjusts sampling defaults to suit thinking vs non-thinking mode.

## Artifacts

Generated files are written under `storage/exports/`.

The backend can:

- persist artifact metadata
- serve preview HTML where available
- serve downloads
- clean up artifacts when owning sessions are deleted

## Testing

```bash
npm run test
```

Current test command runs TypeScript typechecking.

## Typical Local Workflow

1. Start PostgreSQL.
2. Start the Velora backend.
3. Run `npm run db:migrate`.
4. Start the Lena backend with `npm run dev`.
5. Start the frontend from the `frontend/` folder.
6. Log in with a seeded user.
7. Create a session and send prompts.
8. Verify access-denied, access-request, artifact, or thinking-toggle behavior as needed.

## Related Docs

- [velora_backend/API_DOCUMENTATION.md](./velora_backend/API_DOCUMENTATION.md) for the simulated external backend details
