/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable("artifacts");
  if (!exists) {
    await knex.schema.createTable("artifacts", (table) => {
      table.text("id").primary();
      table.text("session_id").notNullable().references("id").inTable("chat_sessions").onDelete("CASCADE");
      table.text("title").notNullable();
      table.text("prompt").notNullable();
      table.text("artifact_type").notNullable();
      table.text("status").notNullable().defaultTo("generated");
      table.jsonb("content_json").nullable();
      table.text("html_preview").nullable();
      table.text("text_content").nullable();
      table.text("file_name").nullable();
      table.text("file_path").nullable();
      table.text("mime_type").nullable();
      table.jsonb("metadata_json").notNullable().defaultTo("{}");
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  await knex.raw("create index if not exists idx_artifacts_session_created on artifacts (session_id, created_at)");
  await knex.raw("create index if not exists idx_artifacts_type_created on artifacts (artifact_type, created_at)");
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("artifacts");
};
