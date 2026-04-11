import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const vectorInstalledCheck = await knex.raw(
    "select exists(select 1 from pg_extension where extname = 'vector') as installed",
  );
  const vectorInstalled = Boolean(vectorInstalledCheck.rows?.[0]?.installed);

  await knex.schema.createTable("customers", (table) => {
    table.uuid("id").primary();
    table.string("customer_number", 32).notNullable().unique();
    table.string("first_name", 120).notNullable();
    table.string("last_name", 120).notNullable();
    table.string("email", 255).notNullable().unique();
    table.string("phone", 40).notNullable();
    table.text("address").notNullable();
    table.string("city", 120).notNullable();
    table.string("country", 120).notNullable();
    table.integer("loyalty_points").notNullable().defaultTo(0);
    table
      .enu("account_status", ["active", "suspended", "closed"], {
        useNative: true,
        enumName: "customer_account_status",
      })
      .notNullable()
      .defaultTo("active");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("credentials", (table) => {
    table.uuid("id").primary();
    table.uuid("customer_id").notNullable().references("id").inTable("customers").onDelete("CASCADE");
    table.string("username", 120).notNullable().unique();
    table.text("password_hash").notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("product_categories", (table) => {
    table.uuid("id").primary();
    table.string("name", 120).notNullable().unique();
    table.string("slug", 160).notNullable().unique();
    table.text("description").notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("products", (table) => {
    table.uuid("id").primary();
    table.string("sku", 64).notNullable().unique();
    table.string("name", 255).notNullable();
    table.text("description").notNullable();
    table.uuid("category_id").notNullable().references("id").inTable("product_categories").onDelete("RESTRICT");
    table.decimal("price", 12, 2).notNullable();
    table.decimal("original_price", 12, 2).nullable();
    table.integer("stock_quantity").notNullable().defaultTo(0);
    table
      .enu("availability_status", ["in_stock", "low_stock", "out_of_stock"], {
        useNative: true,
        enumName: "product_availability_status",
      })
      .notNullable();
    table.string("warranty_duration", 60).notNullable();
    table.integer("return_window_days").notNullable();
    table.boolean("is_promotion_eligible").notNullable().defaultTo(false);
    table.jsonb("specifications").notNullable().defaultTo("{}");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("orders", (table) => {
    table.uuid("id").primary();
    table.string("order_number", 40).notNullable().unique();
    table.uuid("customer_id").notNullable().references("id").inTable("customers").onDelete("CASCADE");
    table
      .enu("status", ["pending", "confirmed", "shipped", "delivered", "cancelled"], {
        useNative: true,
        enumName: "order_status",
      })
      .notNullable();
    table
      .enu("delivery_status", ["processing", "in_transit", "out_for_delivery", "delivered", "failed"], {
        useNative: true,
        enumName: "order_delivery_status",
      })
      .notNullable();
    table.string("tracking_number", 80).nullable();
    table.decimal("total_amount", 12, 2).notNullable();
    table.text("shipping_address").notNullable();
    table.date("estimated_delivery_date").nullable();
    table.date("actual_delivery_date").nullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("order_items", (table) => {
    table.uuid("id").primary();
    table.uuid("order_id").notNullable().references("id").inTable("orders").onDelete("CASCADE");
    table.uuid("product_id").notNullable().references("id").inTable("products").onDelete("RESTRICT");
    table.integer("quantity").notNullable();
    table.decimal("unit_price", 12, 2).notNullable();
    table.decimal("subtotal", 12, 2).notNullable();
  });

  await knex.schema.createTable("returns", (table) => {
    table.uuid("id").primary();
    table.string("return_number", 40).notNullable().unique();
    table.uuid("order_id").notNullable().references("id").inTable("orders").onDelete("CASCADE");
    table.uuid("customer_id").notNullable().references("id").inTable("customers").onDelete("CASCADE");
    table
      .enu("status", ["requested", "approved", "rejected", "completed"], {
        useNative: true,
        enumName: "return_status",
      })
      .notNullable();
    table.text("reason").notNullable();
    table.decimal("refund_amount", 12, 2).nullable();
    table
      .enu("refund_status", ["pending", "processed", "not_applicable"], {
        useNative: true,
        enumName: "refund_status",
      })
      .notNullable();
    table.timestamp("requested_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("resolved_at", { useTz: true }).nullable();
  });

  await knex.schema.createTable("support_tickets", (table) => {
    table.uuid("id").primary();
    table.string("ticket_number", 40).notNullable().unique();
    table.uuid("customer_id").notNullable().references("id").inTable("customers").onDelete("CASCADE");
    table.uuid("order_id").nullable().references("id").inTable("orders").onDelete("SET NULL");
    table.string("subject", 255).notNullable();
    table.text("description").notNullable();
    table
      .enu("status", ["open", "in_progress", "escalated", "resolved", "closed"], {
        useNative: true,
        enumName: "support_ticket_status",
      })
      .notNullable();
    table
      .enu("priority", ["low", "medium", "high", "urgent"], {
        useNative: true,
        enumName: "support_ticket_priority",
      })
      .notNullable()
      .defaultTo("medium");
    table.string("assigned_to", 160).nullable();
    table.integer("queue_position").nullable();
    table.integer("estimated_wait_minutes").nullable();
    table.text("resolution_notes").nullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("loyalty_transactions", (table) => {
    table.uuid("id").primary();
    table.uuid("customer_id").notNullable().references("id").inTable("customers").onDelete("CASCADE");
    table.uuid("order_id").nullable().references("id").inTable("orders").onDelete("SET NULL");
    table
      .enu("transaction_type", ["earned", "redeemed", "adjusted", "expired"], {
        useNative: true,
        enumName: "loyalty_transaction_type",
      })
      .notNullable();
    table.integer("points").notNullable();
    table.text("description").notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("policy_documents", (table) => {
    table.uuid("id").primary();
    table.string("policy_key", 120).notNullable().unique();
    table.string("title", 255).notNullable();
    table.text("content").notNullable();
    table.string("version", 40).notNullable();
    table.date("effective_date").notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("policy_chunks", (table) => {
    table.uuid("id").primary();
    table.uuid("policy_document_id").notNullable().references("id").inTable("policy_documents").onDelete("CASCADE");
    table.integer("chunk_index").notNullable();
    table.text("chunk_text").notNullable();
    if (vectorInstalled) {
      table.specificType("embedding", "vector(1536)").nullable();
    } else {
      table.jsonb("embedding").nullable();
    }
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(["policy_document_id", "chunk_index"]);
  });

  await knex.raw("create index if not exists idx_credentials_customer on credentials (customer_id)");
  await knex.raw("create index if not exists idx_products_category on products (category_id)");
  await knex.raw("create index if not exists idx_products_availability on products (availability_status)");
  await knex.raw("create index if not exists idx_orders_customer_created on orders (customer_id, created_at desc)");
  await knex.raw("create index if not exists idx_orders_status on orders (status, delivery_status)");
  await knex.raw("create index if not exists idx_order_items_order on order_items (order_id)");
  await knex.raw("create index if not exists idx_returns_customer_requested on returns (customer_id, requested_at desc)");
  await knex.raw("create index if not exists idx_returns_order on returns (order_id)");
  await knex.raw("create index if not exists idx_support_tickets_customer_created on support_tickets (customer_id, created_at desc)");
  await knex.raw("create index if not exists idx_support_tickets_status_priority on support_tickets (status, priority)");
  await knex.raw("create index if not exists idx_loyalty_transactions_customer_created on loyalty_transactions (customer_id, created_at desc)");
  await knex.raw("create index if not exists idx_policy_chunks_document on policy_chunks (policy_document_id, chunk_index)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("policy_chunks");
  await knex.schema.dropTableIfExists("policy_documents");
  await knex.schema.dropTableIfExists("loyalty_transactions");
  await knex.schema.dropTableIfExists("support_tickets");
  await knex.schema.dropTableIfExists("returns");
  await knex.schema.dropTableIfExists("order_items");
  await knex.schema.dropTableIfExists("orders");
  await knex.schema.dropTableIfExists("products");
  await knex.schema.dropTableIfExists("product_categories");
  await knex.schema.dropTableIfExists("credentials");
  await knex.schema.dropTableIfExists("customers");

  await knex.raw("DROP TYPE IF EXISTS loyalty_transaction_type");
  await knex.raw("DROP TYPE IF EXISTS support_ticket_priority");
  await knex.raw("DROP TYPE IF EXISTS support_ticket_status");
  await knex.raw("DROP TYPE IF EXISTS refund_status");
  await knex.raw("DROP TYPE IF EXISTS return_status");
  await knex.raw("DROP TYPE IF EXISTS order_delivery_status");
  await knex.raw("DROP TYPE IF EXISTS order_status");
  await knex.raw("DROP TYPE IF EXISTS product_availability_status");
  await knex.raw("DROP TYPE IF EXISTS customer_account_status");
}
