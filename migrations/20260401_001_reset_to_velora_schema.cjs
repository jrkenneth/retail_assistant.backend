/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const extensionCheck = await knex.raw(
    "select exists(select 1 from pg_available_extensions where name = 'vector') as available",
  );
  const vectorAvailable = Boolean(extensionCheck.rows?.[0]?.available);

  if (vectorAvailable) {
    await knex.raw("CREATE EXTENSION IF NOT EXISTS vector");
  } else {
    console.warn(
      "[migration] pgvector extension is not available on this PostgreSQL instance; using fallback embedding column type.",
    );
  }

  await knex.schema.dropTableIfExists("artifacts");
  await knex.schema.dropTableIfExists("presentations");
  await knex.schema.dropTableIfExists("request_traces");
  await knex.schema.dropTableIfExists("chat_messages");
  await knex.schema.dropTableIfExists("chat_sessions");
  await knex.schema.dropTableIfExists("access_requests");
  await knex.schema.dropTableIfExists("audit_log");

  await knex.raw("DROP TYPE IF EXISTS audit_event_type");
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(_knex) {
  // This migration intentionally resets the legacy schema and enables pgvector.
};
