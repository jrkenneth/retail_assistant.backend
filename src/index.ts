import { app } from "./app.js";
import { env } from "./config.js";
import { db } from "./db/client.js";

const port = Number(env.PORT);

const server = app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});

const shutdown = async () => {
  server.close(async () => {
    await db.destroy();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
