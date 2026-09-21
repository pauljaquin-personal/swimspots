import { distanceKm } from "../public/model.js";
export const fields = {
  name: 120,
  region: 80,
  waterbody: 120,
  description: 2000,
  access: 1000,
  parking: 500,
  facilities: 500,
  hazards: 1500,
  sourceUrl: 500,
};
export function validateSubmission(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Provide a location.");
  const data = {};
  for (const [key, max] of Object.entries(fields)) {
    if (typeof input[key] !== "string" || input[key].trim().length > max)
      throw new Error(`Check ${key} (maximum ${max} characters).`);
    data[key] = input[key].trim();
  }
  for (const key of [
    "name",
    "region",
    "waterbody",
    "description",
    "access",
    "hazards",
    "sourceUrl",
  ])
    if (!data[key]) throw new Error(`Please provide ${key}.`);
  if (!["lake", "river", "sea", "pool"].includes(input.type))
    throw new Error("Choose a water type.");
  data.type = input.type;
  if (
    !Array.isArray(input.coordinates) ||
    input.coordinates.length !== 2 ||
    !input.coordinates.every(Number.isFinite)
  )
    throw new Error("Provide numeric latitude and longitude.");
  const [lat, lon] = input.coordinates;
  if (lat < -48 || lat > -33 || lon < 165 || lon > 179.9)
    throw new Error(
      "Choose coordinates in mainland New Zealand (latitude -48 to -33, longitude 165 to 179.9).",
    );
  data.coordinates = [lat, lon];
  let url;
  try {
    url = new URL(data.sourceUrl);
  } catch {
    throw new Error("Provide a valid public source URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !url.hostname.includes(".") ||
    /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(url.hostname)
  )
    throw new Error("Use a public HTTPS source URL.");
  data.sourceUrl = url.href;
  if (input.consent !== true)
    throw new Error("Confirm that these details may be published.");
  return data;
}
export function duplicateSpots(data, spots) {
  return spots
    .filter(
      (s) =>
        distanceKm(data.coordinates, s.coordinates) < 0.2 ||
        (s.name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase() ===
          data.name
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase() &&
          s.region.toLowerCase() === data.region.toLowerCase()),
    )
    .map((s) => ({ id: s.id, name: s.name }));
}
export function publishedSpot(record) {
  const d = record.data;
  return {
    id: `community-${record.id}`,
    name: d.name,
    region: d.region,
    type: d.type,
    waterbody: d.waterbody,
    coordinates: d.coordinates,
    description: d.description,
    access: d.access,
    parking: d.parking || "Not yet verified.",
    facilities: d.facilities || "Not yet verified.",
    hazards: d.hazards,
    listingStatus: "community-reviewed",
    source: {
      name: "Community submission · reviewed",
      url: d.sourceUrl,
      checkedAt: record.reviewedAt.slice(0, 10),
    },
    conditionsSource: {
      name: "LAWA",
      url: "https://www.lawa.org.nz/explore-data/swimming",
    },
    routes: [],
  };
}
export class D1Submissions {
  constructor(db) {
    this.db = db;
  }
  unpack(r) {
    return r ? { ...r, data: JSON.parse(r.data) } : null;
  }
  async get(id) {
    return this.unpack(
      await this.db
        .prepare("SELECT * FROM submissions WHERE id = ?")
        .bind(id)
        .first(),
    );
  }
  async list(status) {
    const r = await this.db
      .prepare(
        "SELECT * FROM submissions WHERE status = ? ORDER BY createdAt DESC LIMIT 500",
      )
      .bind(status)
      .all();
    return r.results.map((r) => this.unpack(r));
  }
  async insert(r) {
    await this.db
      .prepare(
        "INSERT OR IGNORE INTO submissions (id,data,status,createdAt,fingerprint) VALUES (?,?,?,?,?)",
      )
      .bind(r.id, JSON.stringify(r.data), "pending", r.createdAt, r.fingerprint)
      .run();
    return this.get(r.id);
  }
  async review(id, status, data, note, now) {
    const r = await this.db
      .prepare(
        "UPDATE submissions SET status=?,data=?,note=?,reviewedAt=? WHERE id=? AND status='pending'",
      )
      .bind(status, JSON.stringify(data), note, now, id)
      .run();
    return r.meta.changes === 1;
  }
  async quota(key, bucket) {
    const r = await this.db
      .prepare(
        "INSERT INTO submission_limits (key,bucket,n) VALUES (?,?,1) ON CONFLICT(key,bucket) DO UPDATE SET n=n+1 RETURNING n",
      )
      .bind(key, bucket)
      .first();
    await this.db
      .prepare("DELETE FROM submission_limits WHERE bucket < ?")
      .bind(bucket - 1)
      .run();
    return r.n <= 5;
  }
}
export async function fingerprint(value) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
}
const reply = (v, status = 200) =>
  Response.json(v, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function submissionRequest(request, env, catalog, store) {
  const url = new URL(request.url),
    path = url.pathname;
  const local =
    env.LOCAL_REVIEW === true &&
    ["127.0.0.1", "localhost"].includes(url.hostname);
  const admin = path.startsWith("/api/review");
  if (admin && !local) {
    const expected = env.ADMIN_TOKEN;
    if (
      !expected ||
      expected.length < 32 ||
      (await fingerprint(request.headers.get("Authorization") || "")) !==
        (await fingerprint(`Bearer ${expected}`))
    )
      return reply({ error: "Reviewer sign-in required." }, 401);
  }
  if (path === "/api/community-spots" && request.method === "GET") {
    if (!store) return reply({ spots: [], submissionsEnabled: false });
    return reply({
      spots: (await store.list("approved")).map(publishedSpot),
      submissionsEnabled: true,
    });
  }
  if (!store)
    return reply(
      {
        error:
          "Submissions are not enabled on this deployment yet. Your draft has not been submitted.",
      },
      503,
    );
  if (admin && path === "/api/review" && request.method === "GET") {
    const status = url.searchParams.get("status") || "pending";
    if (!["pending", "approved", "rejected"].includes(status))
      return reply({ error: "Unknown status." }, 400);
    return reply({ submissions: await store.list(status) });
  }
  if (request.method !== "POST")
    return reply({ error: "Method not allowed." }, 405);
  if (request.headers.get("Origin") !== url.origin)
    return reply({ error: "Submit from this website." }, 403);
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    return reply({ error: "JSON required." }, 415);
  let raw = "";
  const reader = request.body?.getReader(),
    decoder = new TextDecoder();
  if (reader) {
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16000) {
        await reader.cancel();
        return reply({ error: "Submission is too large." }, 413);
      }
      raw += decoder.decode(value, { stream: true });
    }
  }
  raw += decoder.decode();
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid submission." }, 400);
  }
  if (path === "/api/submissions") {
    if (body.website)
      return reply({ error: "Submission could not be accepted." }, 400);
    if (
      typeof body.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        body.id,
      )
    )
      return reply(
        { error: "Invalid submission reference. Reload and retry." },
        400,
      );
    let data;
    try {
      data = validateSubmission(body);
    } catch (e) {
      return reply({ error: e.message }, 400);
    }
    const hash = await fingerprint(JSON.stringify(data));
    const existing = await store.get(body.id);
    if (existing)
      return existing.fingerprint === hash
        ? reply({ id: existing.id, status: existing.status }, 200)
        : reply(
            {
              error: "This reference was already used. Start a new suggestion.",
            },
            409,
          );
    const ip = request.headers.get("CF-Connecting-IP");
    if (!local && (!ip || !env.ADMIN_TOKEN))
      return reply({ error: "Submissions are temporarily unavailable." }, 503);
    const key = await fingerprint(
      `${env.ADMIN_TOKEN || "local"}:${ip || "local"}`,
    );
    if (!(await store.quota(key, Math.floor(Date.now() / 3600000))))
      return reply(
        {
          error:
            "Too many suggestions this hour. Keep your draft and try later.",
        },
        429,
      );
    const all = [
      ...catalog,
      ...(await store.list("approved")).map(publishedSpot),
    ];
    const duplicates = duplicateSpots(data, all);
    if (duplicates.length && body.duplicateConfirmed !== true)
      return reply(
        {
          error:
            "There may already be a spot here. Check the matches, then confirm if this is a different entry point.",
          duplicates,
        },
        409,
      );
    const created = await store.insert({
      id: body.id,
      data,
      status: "pending",
      createdAt: new Date().toISOString(),
      fingerprint: hash,
    });
    if (created.fingerprint !== hash)
      return reply({ error: "This reference was already used." }, 409);
    return reply({ id: created.id, status: created.status }, 201);
  }
  if (admin && /^\/api\/review\/[0-9a-f-]+$/.test(path)) {
    const id = path.split("/").pop(),
      record = await store.get(id);
    if (!record) return reply({ error: "Suggestion not found." }, 404);
    if (!["approved", "rejected"].includes(body.status))
      return reply({ error: "Choose approve or reject." }, 400);
    if (
      typeof body.note !== "string" ||
      body.note.length > 1500 ||
      !body.note.trim()
    )
      return reply({ error: "Add a review note." }, 400);
    let data = record.data;
    if (body.status === "approved") {
      if (body.reviewConfirmed !== true)
        return reply(
          {
            error:
              "Confirm you checked the location, access, hazards and source.",
          },
          400,
        );
      try {
        data = validateSubmission({ ...body.data, consent: true });
      } catch (e) {
        return reply({ error: e.message }, 400);
      }
    }
    if (
      !(await store.review(
        id,
        body.status,
        data,
        body.note.trim(),
        new Date().toISOString(),
      ))
    )
      return reply(
        { error: "This suggestion was already reviewed. Refresh the queue." },
        409,
      );
    return reply({ id, status: body.status });
  }
  return reply({ error: "Not found." }, 404);
}
