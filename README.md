# Backend

Express + TypeScript API for Retail AI assistant prototype.

## Setup
```bash
npm install
copy .env.example .env
```

## Run
```bash
npm run dev
```

## Build
```bash
npm run build
```

## Agent runtime (current)
- The backend uses a model-driven iterative loop for chat orchestration.
- Per request, the model repeatedly chooses one next action:
	- `call_tool` (with `tool` + `tool_input`), or
	- `respond` (final `message_text`, optional `ui_actions`), or
	- `artefact` (document type + title + summary + semantic HTML persisted to DB).
- The runtime executes tool calls, appends tool outputs to loop context, and asks the model for the next step until completion.
- Runtime guardrails kept in code: timeout/retry, max tool-call budget, total request budget, logging/traces, and response contract validation.
- Prompt safety and policy gating modules were removed from the request path in this phase.

Default local URL: http://localhost:4000

## Local infrastructure
```bash
cd infra
docker compose up -d
```

## Database migrations (Knex + Postgres)
```bash
npm run db:migrate
```

Rollback latest migration batch:
```bash
npm run db:rollback
```

Create a new migration:
```bash
npm run db:make <migration_name>
```
