import fs from "node:fs";
import { openDb } from "./db/schema.js";
import { createApp } from "./app.js";
import path from "node:path";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
const DB_FILE = process.env.MODOP_DB ?? path.resolve("modop.db");
const WEB_DIST = process.env.MODOP_WEB_DIST ?? path.resolve("../web/dist");

const db = openDb(DB_FILE);
const app = createApp(db, fs.existsSync(WEB_DIST) ? WEB_DIST : undefined);

app.listen(PORT, HOST, () => {
  console.log(`Modop prêt sur http://${HOST}:${PORT}`);
  console.log(`Base : ${DB_FILE}`);
  if (fs.existsSync(WEB_DIST)) console.log(`Interface : ${WEB_DIST}`);
  else console.log("Interface : non buildée (cd web && npm run build)");
});
