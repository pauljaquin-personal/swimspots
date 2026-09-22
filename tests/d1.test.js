import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { D1Submissions } from "../src/submissions.js";
let DatabaseSync;
try {
  ({ DatabaseSync } = await import("node:sqlite"));
} catch {}
test(
  "D1 SQL migration, idempotency, atomic moderation, quota and public projection",
  { skip: !DatabaseSync },
  async () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(
        readFileSync(
          new URL("../migrations/0001_submissions.sql", import.meta.url),
          "utf8",
        ),
      );
      const adapter = {
        prepare(sql) {
          return {
            bind(...args) {
              const stmt = db.prepare(sql);
              return {
                async first() {
                  return stmt.get(...args) || null;
                },
                async all() {
                  return { results: stmt.all(...args) };
                },
                async run() {
                  return { meta: stmt.run(...args) };
                },
              };
            },
          };
        },
      };
      const store = new D1Submissions(adapter),
        record = {
          id: "record",
          data: { name: "Original" },
          createdAt: new Date().toISOString(),
          fingerprint: "abc",
        };
      assert.equal((await store.insert(record)).status, "pending");
      assert.equal(
        (await store.insert({ ...record, data: { name: "Overwrite" } })).data
          .name,
        "Original",
      );
      assert.equal((await store.list("approved")).length, 0);
      assert.equal(
        await store.review(
          "record",
          "approved",
          { name: "Reviewed" },
          "Checked",
          "2026-09-21T00:00:00Z",
        ),
        true,
      );
      assert.equal(
        await store.review(
          "record",
          "rejected",
          {},
          "Other",
          "2026-09-21T00:00:00Z",
        ),
        false,
      );
      assert.equal((await store.list("approved"))[0].data.name, "Reviewed");
      for (let i = 0; i < 5; i++)
        assert.equal(await store.quota("hash", 1), true);
      assert.equal(await store.quota("hash", 1), false);
      assert.equal(await store.quota("hash", 2), true);
    } finally {
      db.close();
    }
  },
);
