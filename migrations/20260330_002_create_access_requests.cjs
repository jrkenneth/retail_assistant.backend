/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable("access_requests");
  if (exists) {
    return;
  }

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
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("access_requests");
};
