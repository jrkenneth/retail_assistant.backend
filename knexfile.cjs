require("dotenv").config();

/**
 * @type { import("knex").Knex.Config }
 */
module.exports = {
  client: "pg",
  connection: process.env.DATABASE_URL
    ? process.env.DATABASE_URL
    : {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
      },
  pool: {
    min: 0,
    max: 10,
  },
  migrations: {
    directory: "./migrations",
    tableName: "knex_migrations",
  },
};
