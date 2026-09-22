import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalSubmissions } from "../scripts/local-submissions.js";
import {
  validateSubmission,
  submissionRequest,
  publishedSpot,
} from "../src/submissions.js";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const sample = () => ({
  id: randomUUID(),
  name: "A test swimming place",
  region: "Otago",
  waterbody: "Test Lake",
  type: "lake",
  coordinates: [-44.8, 169.2],
  description: "A test location",
  access: "Public track; verify signage",
  parking: "",
  facilities: "",
  hazards: "Not inspected yet",
  sourceUrl: "https://www.orc.govt.nz/",
  consent: true,
});
const post = (path, body, headers = {}) =>
  new Request("http://127.0.0.1:4173" + path, {
    method: "POST",
    headers: {
      Origin: "http://127.0.0.1:4173",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
async function withStore(fn) {
  const dir = await mkdtemp(join(tmpdir(), "swimspots-test-"));
  try {
    await fn(new LocalSubmissions(join(dir, "db.json")), join(dir, "db.json"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
test("validation rejects invalid coordinates, unsafe links, missing consent and oversize fields", () => {
  for (const edit of [
    { coordinates: [null, 169] },
    { coordinates: [-44, -169] },
    { sourceUrl: "javascript:alert(1)" },
    { sourceUrl: "https://user:pass@example.com" },
    { consent: false },
    { name: "x".repeat(121) },
  ])
    assert.throws(() => validateSubmission({ ...sample(), ...edit }));
  assert.equal(validateSubmission(sample()).parking, "");
});
test("submission survives restart, retries are idempotent, pending stays private, approval publishes edits", () =>
  withStore(async (store, path) => {
    const d = sample(),
      env = { LOCAL_REVIEW: true };
    let r = await submissionRequest(
      post("/api/submissions", d),
      env,
      [],
      store,
    );
    assert.equal(r.status, 201);
    r = await submissionRequest(post("/api/submissions", d), env, [], store);
    assert.equal(r.status, 200);
    store = new LocalSubmissions(path);
    assert.equal((await store.list("pending")).length, 1);
    let publicData = await submissionRequest(
      new Request("http://127.0.0.1:4173/api/community-spots"),
      env,
      [],
      store,
    );
    assert.equal((await publicData.json()).spots.length, 0);
    const edited = { ...d, name: "Edited place" };
    r = await submissionRequest(
      post("/api/review/" + d.id, {
        status: "approved",
        data: edited,
        note: "Verified source and entry point",
        reviewConfirmed: true,
      }),
      env,
      [],
      store,
    );
    assert.equal(r.status, 200);
    const spot = publishedSpot(await store.get(d.id));
    assert.equal(spot.name, "Edited place");
    assert.equal(spot.listingStatus, "community-reviewed");
    assert.equal(spot.note, undefined);
    r = await submissionRequest(
      post("/api/review/" + d.id, {
        status: "rejected",
        note: "Concurrent change",
      }),
      env,
      [],
      store,
    );
    assert.equal(r.status, 409);
  }));
test("admin requires token outside loopback and mutations require matching origin", () =>
  withStore(async (store) => {
    let r = await submissionRequest(
      new Request("https://swimspots.nz/api/review"),
      { LOCAL_REVIEW: true },
      [],
      store,
    );
    assert.equal(r.status, 401);
    r = await submissionRequest(
      post("/api/submissions", sample(), {
        Origin: "https://attacker.example",
      }),
      { LOCAL_REVIEW: true },
      [],
      store,
    );
    assert.equal(r.status, 403);
    r = await submissionRequest(
      new Request("https://swimspots.nz/api/review", {
        headers: { Authorization: "Bearer " + "x".repeat(32) },
      }),
      { ADMIN_TOKEN: "x".repeat(32) },
      [],
      store,
    );
    assert.equal(r.status, 200);
  }));
test("duplicates require confirmation and reused references cannot overwrite records", () =>
  withStore(async (store) => {
    const d = sample(),
      env = { LOCAL_REVIEW: true },
      catalog = [
        {
          id: "original",
          name: d.name,
          region: d.region,
          coordinates: d.coordinates,
        },
      ];
    let r = await submissionRequest(
      post("/api/submissions", d),
      env,
      catalog,
      store,
    );
    assert.equal(r.status, 409);
    assert.equal((await r.json()).duplicates[0].id, "original");
    r = await submissionRequest(
      post("/api/submissions", { ...d, duplicateConfirmed: true }),
      env,
      catalog,
      store,
    );
    assert.equal(r.status, 201);
    r = await submissionRequest(
      post("/api/submissions", { ...d, name: "Changed" }),
      env,
      [],
      store,
    );
    assert.equal(r.status, 409);
  }));
test("rejections stay private and quota persists", () =>
  withStore(async (store) => {
    const d = sample(),
      env = { LOCAL_REVIEW: true };
    await submissionRequest(post("/api/submissions", d), env, [], store);
    assert.equal(
      (
        await submissionRequest(
          post("/api/review/" + d.id, {
            status: "rejected",
            note: "Private access",
          }),
          env,
          [],
          store,
        )
      ).status,
      200,
    );
    const r = await submissionRequest(
      new Request("http://127.0.0.1:4173/api/community-spots"),
      env,
      [],
      store,
    );
    assert.equal((await r.json()).spots.length, 0);
    for (let i = 0; i < 5; i++) assert.equal(await store.quota("ip", 1), true);
    assert.equal(await store.quota("ip", 1), false);
    assert.equal(await store.quota("ip", 2), true);
  }));
test("unconfigured storage fails explicitly; forged published fields are discarded", async () => {
  const d = validateSubmission({
    ...sample(),
    status: "approved",
    source: { url: "javascript:x" },
    council: {},
  });
  assert.equal(d.status, undefined);
  assert.equal(d.council, undefined);
  const r = await submissionRequest(
    post("/api/submissions", sample()),
    {},
    [],
    null,
  );
  assert.equal(r.status, 503);
});
