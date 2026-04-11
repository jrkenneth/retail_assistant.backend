import knex from "knex";
import { env } from "../config.js";

const connection = env.VELORA_DATABASE_URL ?? env.DATABASE_URL;

export const ragDb = knex({
  client: "pg",
  connection,
  pool: {
    min: 0,
    max: 5,
  },
});
