/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable("presentations", (table) => {
    table.text("id").primary();
    table.text("session_id").notNullable().references("id").inTable("chat_sessions").onDelete("CASCADE");
    table.text("title").notNullable();
    table.text("prompt").notNullable();
    table.text("status").notNullable().defaultTo("generated");
    table.text("html_content").notNullable();
    table.jsonb("metadata_json").notNullable().defaultTo("{}");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(["session_id", "created_at"], "idx_presentations_session_created");
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("presentations");
};
