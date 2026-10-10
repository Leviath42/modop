import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb } from "../src/db/schema.js";

// Bug historique : le serveur renvoyait steps.pictos en chaîne JSON brute et
// l'éditeur l'étalait caractère par caractère dans le tableau à chaque clic de
// pictogramme (croissance exponentielle). La migration de openDb répare les
// étapes et les snapshots déjà publiés.
const FILE = path.join(os.tmpdir(), "modop-pictos-repair-test.db");
fs.rmSync(FILE, { force: true });
fs.rmSync(FILE + "-wal", { force: true });
fs.rmSync(FILE + "-shm", { force: true });

// État produit par l'ancien client : caractères de la chaîne JSON + picto ajouté.
const debris = [...JSON.stringify(["epi"]), "outil"];

{
  const db = openDb(FILE);
  const wf = db
    .prepare("INSERT INTO workflows (title, reference) VALUES (?, ?)")
    .run("Ensablage", "MO-R1").lastInsertRowid;
  db.prepare("INSERT INTO steps (workflow_id, position, title, pictos) VALUES (?, 0, ?, ?)")
    .run(wf, "Propre", JSON.stringify(["epi", "attention"]));
  db.prepare("INSERT INTO steps (workflow_id, position, title, pictos) VALUES (?, 1, ?, ?)")
    .run(wf, "Corrompue", JSON.stringify(debris));
  db.prepare("INSERT INTO steps (workflow_id, position, title, pictos) VALUES (?, 2, ?, ?)")
    .run(wf, "JSON invalide", "{pas du json");
  db.prepare("INSERT INTO versions (workflow_id, number, snapshot, author_email) VALUES (?, 1, ?, ?)")
    .run(wf, JSON.stringify({
      workflow: { title: "Ensablage", reference: "MO-R1", description: "", category: "" },
      steps: [
        { id: 1, position: 0, title: "Corrompue", body: "", pictos: debris, photos: [] },
      ],
    }), "test@modop.local");
  db.close();
}

test("openDb répare les pictos corrompus (étapes et snapshots)", () => {
  const db = openDb(FILE);

  const steps = db.prepare("SELECT title, pictos FROM steps ORDER BY position")
    .all() as { title: string; pictos: string }[];
  assert.deepEqual(JSON.parse(steps[0].pictos), ["epi", "attention"], "étape saine inchangée");
  assert.deepEqual(JSON.parse(steps[1].pictos), ["outil"], "débris supprimés, picto réel conservé");
  assert.deepEqual(JSON.parse(steps[2].pictos), [], "JSON invalide remis à zéro");

  const snap = db.prepare("SELECT snapshot FROM versions").get() as { snapshot: string };
  const parsed = JSON.parse(snap.snapshot) as { steps: { pictos: string[] }[] };
  assert.deepEqual(parsed.steps[0].pictos, ["outil"], "snapshot de version réparé (export .docx)");

  db.close();

  // Idempotence : une réouverture ne modifie plus rien.
  const db2 = openDb(FILE);
  const again = db2.prepare("SELECT title, pictos FROM steps ORDER BY position")
    .all() as { title: string; pictos: string }[];
  assert.deepEqual(JSON.parse(again[1].pictos), ["outil"]);
  db2.close();
  console.log("REPARATION PICTOS OK");
});

process.on("exit", () => {
  fs.rmSync(FILE, { force: true });
  fs.rmSync(FILE + "-wal", { force: true });
  fs.rmSync(FILE + "-shm", { force: true });
});
