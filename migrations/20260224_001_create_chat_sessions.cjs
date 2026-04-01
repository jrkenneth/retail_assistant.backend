/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable("chat_sessions");
  if (exists) {
    return;
  }

  await knex.schema.createTable("chat_sessions", (table) => {
    table.text("id").primary();
    table.text("title").notNullable().defaultTo("New Chat");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("chat_sessions");
};
