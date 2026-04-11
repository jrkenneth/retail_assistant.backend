/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const hasEmployeeNumber = await knex.schema.hasColumn("chat_sessions", "employee_number");
  const hasCustomerNumber = await knex.schema.hasColumn("chat_sessions", "customer_number");

  if (hasEmployeeNumber && !hasCustomerNumber) {
    await knex.schema.alterTable("chat_sessions", (table) => {
      table.renameColumn("employee_number", "customer_number");
    });
  }

  await knex.raw("drop index if exists idx_chat_sessions_employee_updated");
  await knex.raw(
    "create index if not exists idx_chat_sessions_customer_updated on chat_sessions (customer_number, updated_at desc)",
  );
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  const hasEmployeeNumber = await knex.schema.hasColumn("chat_sessions", "employee_number");
  const hasCustomerNumber = await knex.schema.hasColumn("chat_sessions", "customer_number");

  if (!hasEmployeeNumber && hasCustomerNumber) {
    await knex.schema.alterTable("chat_sessions", (table) => {
      table.renameColumn("customer_number", "employee_number");
    });
  }

  await knex.raw("drop index if exists idx_chat_sessions_customer_updated");
  await knex.raw(
    "create index if not exists idx_chat_sessions_employee_updated on chat_sessions (employee_number, updated_at desc)",
  );
};
