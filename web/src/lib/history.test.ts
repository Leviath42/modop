// V15 : tests de l'historique global (pile 50, coalescence 900 ms, branchement).
import { test } from "node:test";
import assert from "node:assert";
import { pushHistory, canUndo, canRedo, undo, redo, resetHistory, labels } from "../editor/history";

const cmd = (label: string) => ({ label, undo: async () => {}, redo: async () => {} });

test("push/undo/redo/reset", async () => {
  resetHistory();
  assert.equal(canUndo(), false);
  assert.equal(canRedo(), false);
  pushHistory(cmd("a"));
  assert.equal(canUndo(), true);
  await undo();
  assert.equal(canUndo(), false);
  assert.equal(canRedo(), true);
  await redo();
  assert.equal(canUndo(), true);
  assert.equal(canRedo(), false);
  resetHistory();
  assert.equal(canUndo(), false);
  assert.equal(canRedo(), false);
});

test("limite 50 : les plus anciennes sortent", () => {
  resetHistory();
  for (let i = 0; i < 55; i++) pushHistory(cmd("c" + i));
  assert.equal(labels().length, 50);
  assert.equal(labels()[0], "c5");
  assert.equal(labels()[49], "c54");
});

test("coalescence < 900 ms, meme cle", () => {
  resetHistory();
  pushHistory(cmd("t1"), "patch:1:title");
  pushHistory(cmd("t2"), "patch:1:title");
  pushHistory(cmd("t3"), "patch:1:title");
  assert.equal(labels().length, 1);
});

test("cles differentes : pas de fusion", () => {
  resetHistory();
  pushHistory(cmd("t1"), "patch:1:title");
  pushHistory(cmd("t2"), "patch:1:body");
  assert.equal(labels().length, 2);
});

test("branchement : un push apres undo tronque le redo", async () => {
  resetHistory();
  pushHistory(cmd("a"));
  pushHistory(cmd("b"));
  await undo();
  pushHistory(cmd("c"));
  assert.equal(canRedo(), false);
  assert.equal(labels().length, 2);
  assert.equal(labels()[1], "c");
});
