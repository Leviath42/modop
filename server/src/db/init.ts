import { openDb } from "./schema.js";

const file = process.argv[2] ?? "modop.db";
const db = openDb(file);

if (db.prepare("SELECT COUNT(*) c FROM users").get() === undefined) {
  throw new Error("init failed");
}
console.log(`Base initialisée : ${file}`);
