import dotenv from "dotenv";
import knex from "knex";
import { createRequire } from "module";
import config from "../../knexfile.js";

dotenv.config();

const environment = process.env.NODE_ENV ?? "development";
const require = createRequire(import.meta.url);
const pg = require("pg") as {
	types: {
		setTypeParser: (oid: number, parser: (value: string) => string) => void;
	};
};

// Keep SQL date/time values as raw strings to avoid timezone-based day shifts.
pg.types.setTypeParser(1082, (value) => value);
pg.types.setTypeParser(1114, (value) => value);
pg.types.setTypeParser(1184, (value) => value);

const db = knex(config[environment]);

export default db;
