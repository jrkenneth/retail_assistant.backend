/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable("request_traces");
  if (!exists) {
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
  } else {
    const hasTool = await knex.schema.hasColumn("request_traces", "tool");
    const hasSkill = await knex.schema.hasColumn("request_traces", "skill");
    if (!hasTool && hasSkill) {
      await knex.schema.alterTable("request_traces", (table) => {
        table.renameColumn("skill", "tool");
      });
    }
  }

  await knex.raw("create index if not exists idx_request_traces_session_created on request_traces (session_id, created_at)");
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("request_traces");
};
