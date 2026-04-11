/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.dropTableIfExists("audit_log");
  await knex.raw("DROP TYPE IF EXISTS audit_event_type");
  await knex.raw(
    "CREATE TYPE audit_event_type AS ENUM ('access_denied', 'escalation_triggered', 'refusal_triggered', 'scope_violation')",
  );

  await knex.schema.createTable("audit_log", (table) => {
    table.uuid("id").primary();
    table.text("customer_id").notNullable();
    table.text("customer_email").notNullable();
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
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("audit_log");
  await knex.raw("DROP TYPE IF EXISTS audit_event_type");
  await knex.raw("CREATE TYPE audit_event_type AS ENUM ('access_denied', 'scope_violation')");

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
};
