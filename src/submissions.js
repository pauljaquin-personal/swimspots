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
  photoAlt: 250,
  photoCredit: 120,
};
export function validateSubmission(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Provide a location.");
  const data = {};
  const optionalText = new Set([
    "parking", "facilities", "photoAlt", "photoCredit", "sourceUrl",
  ]);
  for (const [key, max] of Object.entries(fields)) {
    const value =
      input[key] == null && optionalText.has(key) ? "" : input[key];
    if (typeof value !== "string" || value.trim().length > max)
      throw new Error(`Check ${key} (maximum ${max} characters).`);
    data[key] = value.trim();
  }
  for (const key of [
    "name",
    "region",
    "waterbody",
    "description",
    "access",
    "hazards",
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
  if (data.sourceUrl) {
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
  }
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
export function publishedUpdate(record) {
  const d = record.data;
  return {
    targetSpotId: d.targetSpotId,
    access: d.access,
    parking: d.parking || "Not yet verified.",
    facilities: d.facilities || "Not yet verified.",
    hazards: d.hazards,
    sourceUrl: d.sourceUrl || "",
    reviewedAt: record.reviewedAt,
    ...(d.photo
      ? {
          photo: {
            url: `/api/photos/${record.id}`,
            alt: d.photoAlt || `${d.name} swimming spot`,
            ...(d.photoCredit ? { credit: d.photoCredit } : {}),
          },
        }
      : {}),
  };
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
      ...(d.sourceUrl ? { url: d.sourceUrl } : {}),
      checkedAt: record.reviewedAt.slice(0, 10),
    },
    conditionsSource: {
      name: "LAWA",
      url: "https://www.lawa.org.nz/explore-data/swimming",
    },
    ...(d.photo
      ? {
          photo: {
            url: `/api/photos/${record.id}`,
            alt: d.photoAlt || `${d.name} swimming spot`,
            ...(d.photoCredit ? { credit: d.photoCredit } : {}),
          },
        }
      : {}),
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
  async attachPhoto(id, photo) {
    const record = await this.get(id);
    if (!record || record.status !== "pending") return false;
    record.data.photo = photo;
    const r = await this.db
      .prepare("UPDATE submissions SET data=? WHERE id=? AND status='pending'")
      .bind(JSON.stringify(record.data), id)
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
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const photoTypes = {
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": {
    ext: "png",
    magic: (b) =>
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  "image/webp": {
    ext: "webp",
    magic: (b) =>
      String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...b.slice(8, 12)) === "WEBP",
  },
};
export async function submissionRequest(
  request,
  env,
  catalog,
  store,
  photos = null,
) {
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
    if (!store)
      return reply({ spots: [], updates: [], submissionsEnabled: false });
    const approved = await store.list("approved");
    return reply({
      spots: approved.filter((r) => !r.data.targetSpotId).map(publishedSpot),
      updates: approved.filter((r) => r.data.targetSpotId).map(publishedUpdate),
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
  const publicPhoto = path.match(/^\/api\/photos\/([0-9a-f-]+)$/i);
  const reviewPhoto = path.match(/^\/api\/review-photo\/([0-9a-f-]+)$/i);
  if ((publicPhoto || reviewPhoto) && request.method === "GET") {
    if (!photos) return reply({ error: "Photo storage is not configured." }, 503);
    const id = (publicPhoto || reviewPhoto)[1];
    if (!uuidPattern.test(id)) return reply({ error: "Photo not found." }, 404);
    const record = await store.get(id);
    if (!record?.data?.photo) return reply({ error: "Photo not found." }, 404);
    if (publicPhoto && record.status !== "approved")
      return reply({ error: "Photo not found." }, 404);
    const object = await photos.get(record.data.photo.key);
    if (!object) return reply({ error: "Photo not found." }, 404);
    return new Response(object.body, {
      headers: {
        "Content-Type": record.data.photo.contentType,
        "Cache-Control": publicPhoto
          ? "public, max-age=86400, stale-while-revalidate=604800"
          : "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  }
  const uploadPhoto = path.match(/^\/api\/submission-photo\/([0-9a-f-]+)$/i);
  if (uploadPhoto && request.method === "PUT") {
    if (request.headers.get("Origin") !== url.origin)
      return reply({ error: "Upload from this website." }, 403);
    if (!photos) return reply({ error: "Photo uploads are not enabled yet." }, 503);
    const id = uploadPhoto[1];
    if (!uuidPattern.test(id)) return reply({ error: "Unknown submission." }, 404);
    const record = await store.get(id);
    if (!record || record.status !== "pending")
      return reply({ error: "This suggestion cannot accept a photo." }, 409);
    const contentType = (request.headers.get("Content-Type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const type = photoTypes[contentType];
    if (!type)
      return reply({ error: "Use a JPEG, PNG or WebP photograph." }, 415);
    const declared = Number(request.headers.get("Content-Length") || 0);
    if (declared > 8 * 1024 * 1024)
      return reply({ error: "Photo must be 8 MB or smaller." }, 413);
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length || bytes.length > 8 * 1024 * 1024)
      return reply({ error: "Photo must be between 1 byte and 8 MB." }, 413);
    if (!type.magic(bytes))
      return reply({ error: "The uploaded file is not a valid image." }, 415);
    const key = `submissions/${id}/primary.${type.ext}`;
    await photos.put(key, bytes, { httpMetadata: { contentType } });
    if (!(await store.attachPhoto(id, { key, contentType }))) {
      await photos.delete(key);
      return reply({ error: "This suggestion cannot accept a photo." }, 409);
    }
    return reply({ id, uploaded: true }, 201);
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
      !uuidPattern.test(body.id)
    )
      return reply(
        { error: "Invalid submission reference. Reload and retry." },
        400,
      );
    let data;
    try {
      data = validateSubmission(body);
      if (body.targetSpotId != null) {
        if (
          typeof body.targetSpotId !== "string" ||
          !catalog.some((s) => s.id === body.targetSpotId)
        )
          throw new Error("Choose an existing swim spot to update.");
        data.targetSpotId = body.targetSpotId;
      }
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
    const duplicates = data.targetSpotId ? [] : duplicateSpots(data, all);
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
              "Confirm you checked the location, access, hazards and any provided source.",
          },
          400,
        );
      try {
        data = validateSubmission({ ...body.data, consent: true });
        if (record.data.targetSpotId) data.targetSpotId = record.data.targetSpotId;
        if (record.data.photo) data.photo = record.data.photo;
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
    if (body.status === "rejected" && record.data.photo && photos)
      await photos.delete(record.data.photo.key).catch(() => {});
    return reply({ id, status: body.status });
  }
  return reply({ error: "Not found." }, 404);
}
