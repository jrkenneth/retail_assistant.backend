import dotenv from "dotenv";
import knex from "knex";
import config from "../knexfile.js";

dotenv.config();

const environment = process.env.NODE_ENV ?? "development";

const db = knex(config[environment]);

export default db;
