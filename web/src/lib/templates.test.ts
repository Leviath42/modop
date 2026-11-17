// V15 : les 5 modèles qualité doivent être exploitables par la modale de création.
import { test } from "node:test";
import assert from "node:assert";
import { DOCUMENT_TEMPLATES } from "../templates";

test("5 modèles qualité définis, ids uniques", () => {
  assert.equal(DOCUMENT_TEMPLATES.length, 5);
  const ids = DOCUMENT_TEMPLATES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of DOCUMENT_TEMPLATES) {
    assert.ok(t.name.trim() !== "", "nom vide : " + t.id);
  }
});

test("chaque modèle : 3 à 6 étapes, titres et corps non vides", () => {
  for (const t of DOCUMENT_TEMPLATES) {
    assert.ok(t.steps.length >= 3 && t.steps.length <= 6, t.id + " : " + t.steps.length + " étapes");
    for (const s of t.steps) {
      assert.ok(s.title.trim() !== "", t.id + " : titre vide");
      assert.ok(s.body.trim() !== "", t.id + " : corps vide");
    }
  }
});
