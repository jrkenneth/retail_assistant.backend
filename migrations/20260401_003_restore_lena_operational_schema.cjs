/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.dropTableIfExists("audit_log");
  await knex.schema.dropTableIfExists("chat_messages");
  await knex.schema.dropTableIfExists("chat_sessions");
  await knex.schema.dropTableIfExists("policy_chunks");
  await knex.schema.dropTableIfExists("policy_documents");
  await knex.schema.dropTableIfExists("loyalty_transactions");
  await knex.schema.dropTableIfExists("support_tickets");
  await knex.schema.dropTableIfExists("returns");
  await knex.schema.dropTableIfExists("order_items");
  await knex.schema.dropTableIfExists("orders");
  await knex.schema.dropTableIfExists("products");
  await knex.schema.dropTableIfExists("product_categories");
  await knex.schema.dropTableIfExists("credentials");
  await knex.schema.dropTableIfExists("customers");

  await knex.raw("DROP TYPE IF EXISTS velora_audit_event_type");
  await knex.raw("DROP TYPE IF EXISTS chat_message_role");
  await knex.raw("DROP TYPE IF EXISTS loyalty_transaction_type");
  await knex.raw("DROP TYPE IF EXISTS support_ticket_priority");
  await knex.raw("DROP TYPE IF EXISTS support_ticket_status");
  await knex.raw("DROP TYPE IF EXISTS refund_status");
  await knex.raw("DROP TYPE IF EXISTS return_status");
  await knex.raw("DROP TYPE IF EXISTS order_delivery_status");
  await knex.raw("DROP TYPE IF EXISTS order_status");
  await knex.raw("DROP TYPE IF EXISTS product_availability_status");
  await knex.raw("DROP TYPE IF EXISTS customer_account_status");

  const hasChatSessions = await knex.schema.hasTable("chat_sessions");
  if (!hasChatSessions) {
    await knex.schema.createTable("chat_sessions", (table) => {
      table.text("id").primary();
      table.text("title").notNullable().defaultTo("New Chat");
      table.text("employee_number").nullable();
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    await knex.raw(
      "create index if not exists idx_chat_sessions_employee_updated on chat_sessions (employee_number, updated_at desc)",
    );
  }

  const hasChatMessages = await knex.schema.hasTable("chat_messages");
  if (!hasChatMessages) {
    await knex.schema.createTable("chat_messages", (table) => {
      table.text("id").primary();
      table.text("session_id").notNullable().references("id").inTable("chat_sessions").onDelete("CASCADE");
      table.text("role").notNullable();
      table.text("message_text").notNullable();
      table.jsonb("payload_json").notNullable().defaultTo("{}");
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    await knex.raw(
      "create index if not exists idx_chat_messages_session_created on chat_messages (session_id, created_at)",
    );
  }

  const hasRequestTraces = await knex.schema.hasTable("request_traces");
  if (!hasRequestTraces) {
    await knex.schema.createTable("request_traces", (table) => {
      table.text("id").primary();
      table.text("session_id").notNullable().references("id").inTable("chat_sessions").onDelete("CASCADE");
      table.text("reference_id").notNullable();
      table.text("tool").notNullable();
      table.text("status").notNullable();
      table.integer("latency_ms").notNullable().defaultTo(0);
      table.integer("attempts").notNullable().defaultTo(1);
      table.text("error_code").nullable();
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    await knex.raw(
      "create index if not exists idx_request_traces_session_created on request_traces (session_id, created_at)",
    );
  }

  const hasArtifacts = await knex.schema.hasTable("artifacts");
  if (!hasArtifacts) {
    await knex.schema.createTable("artifacts", (table) => {
      table.text("id").primary();
      table.text("session_id").notNullable().references("id").inTable("chat_sessions").onDelete("CASCADE");
      table.text("title").notNullable();
      table.text("prompt").notNullable();
      table.text("artifact_type").notNullable();
      table.text("status").notNullable().defaultTo("generated");
      table.jsonb("content_json").nullable();
      table.text("html_preview").nullable();
      table.text("text_content").nullable();
      table.text("file_name").nullable();
      table.text("file_path").nullable();
      table.text("mime_type").nullable();
      table.jsonb("metadata_json").notNullable().defaultTo("{}");
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    await knex.raw("create index if not exists idx_artifacts_session_created on artifacts (session_id, created_at)");
    await knex.raw("create index if not exists idx_artifacts_type_created on artifacts (artifact_type, created_at)");
  }

  const hasAccessRequests = await knex.schema.hasTable("access_requests");
  if (!hasAccessRequests) {
    await knex.schema.createTable("access_requests", (table) => {
      table.text("id").primary();
      table.text("reference_number").notNullable().unique();
      table.text("requested_by").notNullable();
      table.text("requested_role").notNullable();
      table.text("resource_requested").notNullable();
      table.text("justification").notNullable();
      table.text("status").notNullable().defaultTo("pending");
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  const auditTypeCheck = await knex.raw(
    "select exists(select 1 from pg_type where typname = 'audit_event_type') as exists",
  );
  const hasAuditType = Boolean(auditTypeCheck.rows?.[0]?.exists);
  if (!hasAuditType) {
    await knex.raw("CREATE TYPE audit_event_type AS ENUM ('access_denied', 'scope_violation')");
  }

  const hasAuditLog = await knex.schema.hasTable("audit_log");
  if (!hasAuditLog) {
    await knex.schema.createTable("audit_log", (table) => {
      table.uuid("id").primary();
      table.text("employee_number").notNullable();
      table.text("full_name").notNullable();
      table.text("role").notNullable();
      table
        .specificType("event_type", "audit_event_type")
        .notNullable();
      table.text("domain").notNullable();
      table.text("intent").notNullable();
      table.jsonb("params_snapshot").notNullable();
      table.text("reason").notNullable();
      table.text("ip_address").nullable();
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("audit_log");
  await knex.schema.dropTableIfExists("access_requests");
  await knex.schema.dropTableIfExists("artifacts");
  await knex.schema.dropTableIfExists("request_traces");
  await knex.schema.dropTableIfExists("chat_messages");
  await knex.schema.dropTableIfExists("chat_sessions");
  await knex.raw("DROP TYPE IF EXISTS audit_event_type");
};
