import knex from "knex";
import { createRequire } from "module";
import { env } from "../config.js";

const require = createRequire(import.meta.url);
const pg = require("pg") as {
  types: {
    setTypeParser: (oid: number, parser: (value: string) => string) => void;
  };
};

// Keep SQL date/time values as raw strings to avoid timezone-based shifts.
pg.types.setTypeParser(1082, (value) => value);
pg.types.setTypeParser(1114, (value) => value);
pg.types.setTypeParser(1184, (value) => value);

export const db = knex({
  client: "pg",
  connection: env.DATABASE_URL,
  pool: {
    min: 0,
    max: 10,
  },
});

