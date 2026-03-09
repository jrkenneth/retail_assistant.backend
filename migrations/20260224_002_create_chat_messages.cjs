/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable("chat_messages", (table) => {
    table.text("id").primary();
    table.text("session_id").notNullable().references("id").inTable("chat_sessions").onDelete("CASCADE");
    table.text("role").notNullable();
    table.text("message_text").notNullable();
    table.jsonb("payload_json").notNullable().defaultTo("{}");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(["session_id", "created_at"], "idx_chat_messages_session_created");
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("chat_messages");
};

