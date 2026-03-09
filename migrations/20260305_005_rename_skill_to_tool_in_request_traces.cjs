/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable("request_traces", (table) => {
    table.renameColumn("skill", "tool");
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.alterTable("request_traces", (table) => {
    table.renameColumn("tool", "skill");
  });
};
