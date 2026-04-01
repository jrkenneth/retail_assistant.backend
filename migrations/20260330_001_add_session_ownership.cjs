/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const hasEmployeeNumber = await knex.schema.hasColumn("chat_sessions", "employee_number");
  if (!hasEmployeeNumber) {
    await knex.schema.alterTable("chat_sessions", (table) => {
      table.text("employee_number").nullable();
    });
  }

  await knex.raw(
    "create index if not exists idx_chat_sessions_employee_updated on chat_sessions (employee_number, updated_at desc)",
  );
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  const hasEmployeeNumber = await knex.schema.hasColumn("chat_sessions", "employee_number");
  if (hasEmployeeNumber) {
    await knex.schema.alterTable("chat_sessions", (table) => {
      table.dropColumn("employee_number");
    });
  }
};
