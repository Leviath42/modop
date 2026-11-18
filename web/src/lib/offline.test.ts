import { describe, it } from "node:test";
import assert from "node:assert";
import { precacheUrls, precacheReport } from "./offline";

describe("offline", () => {
  it("should filter published workflows and limit to 200", () => {
    const workflows = [
      { id: 1, state: "published" },
      { id: 2, state: "draft" },
      { id: 3, state: "published" },
    ];
    const lastVersions = { 1: 1, 3: 2 };
    const urls = precacheUrls(workflows, lastVersions);
    assert.strictEqual(urls.length, 4);
    assert.ok(urls.includes("/api/workflows/1/versions"));
    assert.ok(urls.includes("/api/workflows/1/versions/1"));
    assert.ok(urls.includes("/api/workflows/3/versions"));
    assert.ok(urls.includes("/api/workflows/3/versions/2"));
  });

  it("should generate correct URLs", () => {
    const workflows = [{ id: 1, state: "published" }];
    const lastVersions = { 1: 1 };
    const urls = precacheUrls(workflows, lastVersions);
    assert.deepStrictEqual(urls, [
      "/api/workflows/1/versions",
      "/api/workflows/1/versions/1",
    ]);
  });

  it("should generate a report", () => {
    const urls = ["/api/workflows/1/versions", "/api/workflows/2/versions"];
    const failures = ["/api/workflows/2/versions"];
    const report = precacheReport(urls, failures);
    assert.strictEqual(report.ok, false);
    assert.strictEqual(report.done, 1);
    assert.strictEqual(report.failed, 1);
    assert.strictEqual(report.message, "Pré-cache terminé : 1 URLs mises en cache, 1 échecs");
  });

  it("should handle empty input", () => {
    const urls = precacheUrls([], {});
    assert.strictEqual(urls.length, 0);
    const report = precacheReport([], []);
    assert.strictEqual(report.ok, true);
    assert.strictEqual(report.done, 0);
    assert.strictEqual(report.failed, 0);
    assert.strictEqual(report.message, "Pré-cache terminé : 0 URLs mises en cache");
  });
});