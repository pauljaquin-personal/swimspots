import catalog from "../public/data/spots.json" with { type: "json" };
import { getConditions, RETAIN_MS } from "./feeds.js";
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
  if (request.method !== "GET")
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET" },
    });
  if (url.pathname !== "/api/conditions")
    return json({ error: "Not found" }, 404);
  if (
    [...url.searchParams.keys()].some((k) => k !== "spot") ||
    url.searchParams.getAll("spot").length !== 1
  )
    return json({ error: "Supply one spot identifier" }, 400);
  const spot = catalog.spots.find((s) => s.id === url.searchParams.get("spot"));
  if (!spot) return json({ error: "Unknown spot" }, 404);
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
