/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable("request_traces", (table) => {
    table.text("id").primary();
    table.text("session_id").notNullable().references("id").inTable("chat_sessions").onDelete("CASCADE");
    table.text("reference_id").notNullable();
    table.text("skill").notNullable();
    table.text("status").notNullable();
    table.integer("latency_ms").notNullable().defaultTo(0);
    table.integer("attempts").notNullable().defaultTo(1);
    table.text("error_code").nullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(["session_id", "created_at"], "idx_request_traces_session_created");
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("request_traces");
};

