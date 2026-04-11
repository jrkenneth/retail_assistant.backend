/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const hasClosedAt = await knex.schema.hasColumn("chat_sessions", "closed_at");
  if (!hasClosedAt) {
    await knex.schema.alterTable("chat_sessions", (table) => {
      table.timestamp("closed_at", { useTz: true }).nullable();
    });
  }
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  const hasClosedAt = await knex.schema.hasColumn("chat_sessions", "closed_at");
  if (hasClosedAt) {
    await knex.schema.alterTable("chat_sessions", (table) => {
      table.dropColumn("closed_at");
    });
  }
};
