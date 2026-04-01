/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable("chat_messages");
  if (!exists) {
    await knex.schema.createTable("chat_messages", (table) => {
      table.text("id").primary();
      table.text("session_id").notNullable().references("id").inTable("chat_sessions").onDelete("CASCADE");
      table.text("role").notNullable();
      table.text("message_text").notNullable();
      table.jsonb("payload_json").notNullable().defaultTo("{}");
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  await knex.raw("create index if not exists idx_chat_messages_session_created on chat_messages (session_id, created_at)");
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("chat_messages");
};
