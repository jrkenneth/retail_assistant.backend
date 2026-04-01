import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("entities", (table) => {
    table.increments("id").primary();
    table.string("name", 150).notNullable();
    table.string("registration_number", 50).notNullable().unique();
    table.string("entity_type", 50).notNullable();
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("companies", (table) => {
    table.increments("id").primary();
    table.integer("entity_id").notNullable().references("id").inTable("entities");
    table.string("name", 150).notNullable();
    table.string("company_code", 20).notNullable().unique();
    table.string("industry", 100);
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("departments", (table) => {
    table.increments("id").primary();
    table.integer("company_id").notNullable().references("id").inTable("companies");
    table.string("name", 100).notNullable();
    table.string("code", 20).notNullable();
    table.boolean("is_active").notNullable().defaultTo(true);
    table.unique(["company_id", "code"]);
  });

  await knex.schema.createTable("job_grades", (table) => {
    table.increments("id").primary();
    table.string("code", 10).notNullable().unique();
    table.string("title", 50).notNullable();
    table.integer("level").notNullable();
    table.decimal("min_salary", 12, 2);
    table.decimal("max_salary", 12, 2);
  });

  await knex.schema.createTable("job_titles", (table) => {
    table.increments("id").primary();
    table.string("title", 100).notNullable().unique();
    table.integer("job_grade_id").notNullable().references("id").inTable("job_grades");
    table.string("department_code", 20);
  });

  await knex.schema.createTable("employees", (table) => {
    table.increments("id").primary();
    table.integer("entity_id").notNullable().references("id").inTable("entities");
    table.integer("company_id").notNullable().references("id").inTable("companies");
    table.integer("department_id").notNullable().references("id").inTable("departments");
    table.integer("job_title_id").notNullable().references("id").inTable("job_titles");
    table.string("employee_number", 20).notNullable().unique();
    table.string("first_name", 80).notNullable();
    table.string("last_name", 80).notNullable();
    table.string("email", 150).notNullable().unique();
    table.string("phone", 20);
    table.date("date_of_birth");
    table.date("date_joined").notNullable();
    table.date("date_left");
    table.string("employment_type", 30).notNullable();
    table.integer("manager_id").references("id").inTable("employees");
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("employment_history", (table) => {
    table.increments("id").primary();
    table.integer("employee_id").notNullable().references("id").inTable("employees");
    table.integer("company_id").notNullable().references("id").inTable("companies");
    table.integer("department_id").notNullable().references("id").inTable("departments");
    table.integer("job_title_id").notNullable().references("id").inTable("job_titles");
    table.date("effective_from").notNullable();
    table.date("effective_to");
    table.string("change_reason", 100);
  });

  await knex.schema.createTable("leave_types", (table) => {
    table.increments("id").primary();
    table.string("name", 50).notNullable().unique();
    table.integer("max_days");
  });

  await knex.schema.createTable("leave_records", (table) => {
    table.increments("id").primary();
    table.integer("employee_id").notNullable().references("id").inTable("employees");
    table.integer("leave_type_id").notNullable().references("id").inTable("leave_types");
    table.date("start_date").notNullable();
    table.date("end_date").notNullable();
    table.decimal("days_taken", 4, 1).notNullable();
    table.string("status", 20).notNullable().defaultTo("pending");
    table.integer("approved_by").references("id").inTable("employees");
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("payroll", (table) => {
    table.increments("id").primary();
    table.integer("employee_id").notNullable().references("id").inTable("employees");
    table.date("effective_from").notNullable();
    table.date("effective_to");
    table.decimal("gross_salary", 12, 2).notNullable();
    table.specificType("currency", "char(3)").notNullable().defaultTo("MUR");
    table.string("pay_frequency", 20).notNullable().defaultTo("monthly");
    table.string("bank_name", 100);
    table.string("bank_account", 30);
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("performance_reviews", (table) => {
    table.increments("id").primary();
    table.integer("employee_id").notNullable().references("id").inTable("employees");
    table.integer("reviewer_id").notNullable().references("id").inTable("employees");
    table.string("review_period", 20).notNullable();
    table.decimal("rating", 3, 1);
    table.text("comments");
    table.timestamp("submitted_at", { useTz: true });
    table.string("status", 20).notNullable().defaultTo("draft");
  });
}

export async function down(knex: Knex): Promise<void> {
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
}
