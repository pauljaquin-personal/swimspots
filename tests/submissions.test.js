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
  photoAlt: "",
  photoCredit: "",
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

test("photo upload stays private until approval and publishes through the photo endpoint", () =>
  withStore(async (store) => {
    class FakePhotos {
      constructor() {
        this.objects = new Map();
      }
      async put(key, bytes, options) {
        this.objects.set(key, {
          bytes: new Uint8Array(bytes),
          httpMetadata: options?.httpMetadata || {},
        });
      }
      async get(key) {
        const value = this.objects.get(key);
        if (!value) return null;
        return {
          body: value.bytes,
          httpMetadata: value.httpMetadata,
        };
      }
      async delete(key) {
        this.objects.delete(key);
      }
    }
    const photos = new FakePhotos();
    const d = { ...sample(), photoAlt: "A test lake entry point", photoCredit: "Test photographer" };
    const env = { LOCAL_REVIEW: true };
    let response = await submissionRequest(post("/api/submissions", d), env, [], store, photos);
    assert.equal(response.status, 201);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]);
    response = await submissionRequest(
      new Request("http://127.0.0.1:4173/api/submission-photo/" + d.id, {
        method: "PUT",
        headers: {
          Origin: "http://127.0.0.1:4173",
          "Content-Type": "image/jpeg",
        },
        body: jpeg,
      }),
      env,
      [],
      store,
      photos,
    );
    assert.equal(response.status, 201);
    response = await submissionRequest(
      new Request("http://127.0.0.1:4173/api/photos/" + d.id),
      env,
      [],
      store,
      photos,
    );
    assert.equal(response.status, 404);
    response = await submissionRequest(
      post("/api/review/" + d.id, {
        status: "approved",
        data: d,
        note: "Verified photo and listing",
        reviewConfirmed: true,
      }),
      env,
      [],
      store,
      photos,
    );
    assert.equal(response.status, 200);
    const spot = publishedSpot(await store.get(d.id));
    assert.equal(spot.photo.url, "/api/photos/" + d.id);
    assert.equal(spot.photo.alt, d.photoAlt);
    assert.equal(spot.photo.credit, d.photoCredit);
    response = await submissionRequest(
      new Request("http://127.0.0.1:4173/api/photos/" + d.id),
      env,
      [],
      store,
      photos,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "image/jpeg");
  }));

test("photo upload rejects unsupported content and oversize declarations", () =>
  withStore(async (store) => {
    const photos = {
      put: async () => {},
      get: async () => null,
      delete: async () => {},
    };
    const d = sample(),
      env = { LOCAL_REVIEW: true };
    await submissionRequest(post("/api/submissions", d), env, [], store, photos);
    let response = await submissionRequest(
      new Request("http://127.0.0.1:4173/api/submission-photo/" + d.id, {
        method: "PUT",
        headers: {
          Origin: "http://127.0.0.1:4173",
          "Content-Type": "text/plain",
        },
        body: "not an image",
      }),
      env,
      [],
      store,
      photos,
    );
    assert.equal(response.status, 415);
    response = await submissionRequest(
      new Request("http://127.0.0.1:4173/api/submission-photo/" + d.id, {
        method: "PUT",
        headers: {
          Origin: "http://127.0.0.1:4173",
          "Content-Type": "image/jpeg",
          "Content-Length": String(9 * 1024 * 1024),
        },
        body: new Uint8Array([0xff, 0xd8, 0xff]),
      }),
      env,
      [],
      store,
      photos,
    );
    assert.equal(response.status, 413);
  }));

test("optional source accepts missing and blank values but still validates supplied URLs", () => {
  for (const value of [undefined, null, "", "   "]) {
    const data = validateSubmission({ ...sample(), sourceUrl: value });
    assert.equal(data.sourceUrl, "");
    const spot = publishedSpot({ id: "test", data, reviewedAt: "2026-09-22" });
    assert.equal(spot.source.url, undefined);
    assert.equal(spot.source.name, "Community submission · reviewed");
  }
  assert.equal(validateSubmission({ ...sample(), sourceUrl: " https://example.com " }).sourceUrl, "https://example.com/");
  for (const value of ["bad-url", "http://example.com", "https://localhost", 123, "x".repeat(501)])
    assert.throws(() => validateSubmission({ ...sample(), sourceUrl: value }));
});
