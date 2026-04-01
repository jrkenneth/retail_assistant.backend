import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const extensionCheck = await knex.raw(
    "select exists(select 1 from pg_available_extensions where name = 'vector') as available",
  );
  const vectorAvailable = Boolean(extensionCheck.rows?.[0]?.available);

  if (vectorAvailable) {
    await knex.raw("CREATE EXTENSION IF NOT EXISTS vector");
  } else {
    console.warn(
      "[migration] pgvector extension is not available on this PostgreSQL instance; using fallback embedding column type.",
    );
  }

  await knex.schema.dropTableIfExists("credentials");
  await knex.schema.dropTableIfExists("performance_reviews");
  await knex.schema.dropTableIfExists("payroll");
  await knex.schema.dropTableIfExists("leave_records");
  await knex.schema.dropTableIfExists("leave_types");
  await knex.schema.dropTableIfExists("employment_history");
  await knex.schema.dropTableIfExists("employees");
  await knex.schema.dropTableIfExists("job_titles");
  await knex.schema.dropTableIfExists("job_grades");
  await knex.schema.dropTableIfExists("departments");
  await knex.schema.dropTableIfExists("companies");
  await knex.schema.dropTableIfExists("entities");

  await knex.schema.dropTableIfExists("policy_chunks");
  await knex.schema.dropTableIfExists("policy_documents");
  await knex.schema.dropTableIfExists("loyalty_transactions");
  await knex.schema.dropTableIfExists("support_tickets");
  await knex.schema.dropTableIfExists("returns");
  await knex.schema.dropTableIfExists("order_items");
  await knex.schema.dropTableIfExists("orders");
  await knex.schema.dropTableIfExists("products");
  await knex.schema.dropTableIfExists("product_categories");
  await knex.schema.dropTableIfExists("customers");

  await knex.raw("DROP TYPE IF EXISTS customer_account_status");
  await knex.raw("DROP TYPE IF EXISTS product_availability_status");
  await knex.raw("DROP TYPE IF EXISTS order_status");
  await knex.raw("DROP TYPE IF EXISTS order_delivery_status");
  await knex.raw("DROP TYPE IF EXISTS return_status");
  await knex.raw("DROP TYPE IF EXISTS refund_status");
  await knex.raw("DROP TYPE IF EXISTS support_ticket_status");
  await knex.raw("DROP TYPE IF EXISTS support_ticket_priority");
  await knex.raw("DROP TYPE IF EXISTS loyalty_transaction_type");
}

export async function down(): Promise<void> {
  // This migration intentionally resets the legacy HR schema so the Velora schema can replace it.
}
