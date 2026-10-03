import catalog from "../public/data/spots.json" with { type: "json" };
import {
  getConditions,
  RETAIN_MS,
  fetchLawaSwim,
  fetchNearestToilet,
} from "./feeds.js";
import {
  D1Submissions,
  submissionRequest,
  publishedSpot,
} from "./submissions.js";
const inFlight = new Map();
const json = (value, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function handleRequest(
  request,
  env,
  ctx,
  {
    cache = globalThis.caches?.default,
    fetchImpl = fetch,
    now = Date.now(),
  } = {},
) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
  const store =
    env.SUBMISSION_STORE ||
    (env.SUBMISSIONS_DB ? new D1Submissions(env.SUBMISSIONS_DB) : null);
  if (
    ["/api/submissions", "/api/community-spots", "/api/review"].includes(
      url.pathname,
    ) ||
    url.pathname.startsWith("/api/review/") ||
    url.pathname.startsWith("/api/submission-photo/") ||
    url.pathname.startsWith("/api/photos/") ||
    url.pathname.startsWith("/api/review-photo/")
  ) {
    try {
      return await submissionRequest(
        request,
        env,
        catalog.spots,
        store,
        env.SPOT_PHOTOS || null,
      );
    } catch {
      return json(
        {
          error:
            "The service could not save or load this request. Keep your draft and retry.",
        },
        503,
      );
    }
  }
  if (request.method !== "GET")
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET" },
    });
  if (!["/api/conditions", "/api/lawa", "/api/nearest-toilet"].includes(url.pathname))
    return json({ error: "Not found" }, 404);
  if (
    [...url.searchParams.keys()].some((k) => k !== "spot") ||
    url.searchParams.getAll("spot").length !== 1
  )
    return json({ error: "Supply one spot identifier" }, 400);
  const id = url.searchParams.get("spot");
  let spot = catalog.spots.find((s) => s.id === id);
  if (!spot && store && /^community-[0-9a-f-]{36}$/.test(id || "")) {
    try {
      const record = await store.get(id.slice(10));
      if (record?.status === "approved") spot = publishedSpot(record);
    } catch {
      return json({ error: "Spot unavailable" }, 503);
    }
  }
  if (!spot) return json({ error: "Unknown spot" }, 404);

  if (url.pathname === "/api/lawa") {
    if (!spot.lawa?.siteId)
      return json({
        status: "unavailable",
        longTermGrade: null,
        latestResult: null,
        sourceUrl: spot.conditionsSource?.url || null,
      });
    return json(await fetchLawaSwim(spot, { fetchImpl }));
  }

  if (url.pathname === "/api/nearest-toilet") {
    const toiletCacheKey = new Request(
      `${url.origin}/__toilet-cache/v3/${spot.id}`,
    );
    try {
      const hit = await cache?.match(toiletCacheKey);
      if (hit) return json(await hit.json());
    } catch {}

    const result = await fetchNearestToilet(spot, { fetchImpl });
    if (cache && ["available", "none-found"].includes(result.status)) {
      const maxAge =
        result.status === "available" ? 7 * 24 * 60 * 60 : 24 * 60 * 60;
      const response = new Response(JSON.stringify(result), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${maxAge}`,
        },
      });
      const write = cache.put(toiletCacheKey, response).catch(() => {});
      if (ctx?.waitUntil) ctx.waitUntil(write);
    }
    return json(result);
  }

  // Only known catalog coordinates are accepted. This cannot proxy arbitrary URLs.
  const cacheKey = new Request(
    `${url.origin}/__feed-cache/v1/${env.OPEN_METEO_API_KEY ? "commercial" : "prototype"}/${spot.id}`,
  );
  let cached = null;
  try {
    const hit = await cache?.match(cacheKey);
    if (hit) cached = await hit.json();
  } catch {
    /* Cache failure should not block providers. */
  }
  const key = cacheKey.url;
  if (!inFlight.has(key)) {
    const task = getConditions(spot, {
      cached,
      now,
      fetchImpl,
      apiKey: env.OPEN_METEO_API_KEY || "",
    })
      .then(async (data) => {
        if (cache) {
          const result = new Response(JSON.stringify(data), {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": `public, max-age=${RETAIN_MS / 1000}`,
            },
          });
          const write = cache.put(cacheKey, result).catch(() => {});
          if (ctx?.waitUntil) ctx.waitUntil(write);
          else await write;
        }
        return data;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, task);
  }
  try {
    return json(await inFlight.get(key));
  } catch {
    return json({ error: "Conditions temporarily unavailable" }, 503);
  }
}
export default { fetch: handleRequest };
