import dotenv from "dotenv";
import db from "./db/knex.js";
import app from "./app.js";

dotenv.config();

const port = Number(process.env.PORT ?? 4001);

async function start() {
  try {
    await db.raw("select 1");
    app.listen(port, () => {
      console.log(`Ecommerce Demo Backend listening on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start application", error);
    process.exit(1);
  }
}

void start();
