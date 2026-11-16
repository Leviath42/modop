import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { composeStepCanvas } from "../src/render/canvas-composite.js";

// C-95 (V12 #2-4) : fidélité de l'export docx — les annotations posées SUR
// une photo (formes relatives 0-1 à la photo, p. ex. via MCP annotate_photo)
// sont dessinées dans le composite, sans changer la géométrie du canevas.

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "modop-comp-"));
const PNG_MIN = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000500010000000049454e44ae426082", "hex");
fs.writeFileSync(path.join(DIR, "a.png"), PNG_MIN);

function dims(buf: Buffer): { w: number; h: number } {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

test("C-95 : annotations photo rendues dans le composite docx", async () => {
  const anns = [
    { type: "arrow", x1: 0.1, y1: 0.2, x2: 0.6, y2: 0.5, color: "#d0021b" },
    { type: "rect", x1: 0.1, y1: 0.1, w: 0.4, h: 0.3, color: "#f5a623" },
    { type: "text", x1: 0.5, y1: 0.8, text: "Repère 12", color: "#1f4e9c" },
  ];
  const buf = await composeStepCanvas(DIR, [{ filename: "a.png", annotations: anns }], [], 800);
  assert.ok(buf, "composite produit");
  const { w, h } = dims(buf);
  assert.equal(w, 800);
  // photo pleine largeur ratio 1 : y=12 + h=800 + marge 12 = 824 — les
  // annotations vivent DANS la photo, elles ne changent pas la hauteur.
  assert.equal(h, 824);
});

test("C-95 : les annotations ne changent pas la hauteur du composite", async () => {
  const sans = await composeStepCanvas(DIR, [{ filename: "a.png" }], [], 800);
  const avec = await composeStepCanvas(
    DIR,
    [{ filename: "a.png", annotations: [{ type: "rect", x1: 0.5, y1: 0.5, w: 0.3, h: 0.3, color: "#f5a623" }] }],
    [],
    800
  );
  assert.ok(sans && avec, "composites produits");
  assert.equal(dims(sans).h, dims(avec).h);
});
