import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("products", (table) => {
    table.text("image_url").nullable();
    table.decimal("rating", 3, 1).nullable();
    table.integer("review_count").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("products", (table) => {
    table.dropColumn("image_url");
    table.dropColumn("rating");
    table.dropColumn("review_count");
  });
}
