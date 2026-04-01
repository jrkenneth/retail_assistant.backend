import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("credentials", (table) => {
    table.increments("id").primary();
    table.string("employee_number", 20).notNullable().unique();
    table
      .foreign("employee_number")
      .references("employee_number")
      .inTable("employees")
      .onDelete("CASCADE");
    table.string("username", 100).notNullable().unique();
    table.string("password_hash", 255).notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("credentials");
}
