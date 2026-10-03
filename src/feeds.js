// Provider adapters return model valid times, never fabricated observation times.
export const REFRESH_MS = 15 * 60_000;
export const RETAIN_MS = 60 * 60_000;
const HOUR = 3_600_000;
export const SOURCES = {
  weather: {
    name: "Open-Meteo",
    url: "https://open-meteo.com/",
    licence: "CC BY 4.0",
    kind: "model",
  },
  marine: {
    name: "Open-Meteo Marine",
    url: "https://open-meteo.com/en/docs/marine-weather-api",
    licence: "CC BY 4.0",
    kind: "model",
  },
};
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const timestamp = (value) =>
  finite(value) && value > 0 && value < 10_000_000_000
    ? new Date(value * 1000).toISOString()
    : null;
function metric(value, unit, expected, min, max) {
  return finite(value) && value >= min && value <= max && unit === expected
    ? { value, unit }
    : { value: null, unit: expected };
}
function modelStatus(validAt, now) {
  if (!validAt || Date.parse(validAt) > now + 15 * 60_000) return "unavailable";
  return now - Date.parse(validAt) > 3 * HOUR ? "stale" : "fresh";
}
function grid(data) {
  return finite(data.latitude) && finite(data.longitude)
    ? { latitude: data.latitude, longitude: data.longitude }
    : null;
}
export function normaliseWeather(data, now = Date.now()) {
  const c = data.current || {},
    u = data.current_units || {},
    h = data.hourly || {},
    hu = data.hourly_units || {};
  const validAt = u.time === "unixtime" ? timestamp(c.time) : null;
  const current = {
    airTemperature: metric(c.temperature_2m, u.temperature_2m, "°C", -90, 65),
    windSpeed: metric(c.wind_speed_10m, u.wind_speed_10m, "km/h", 0, 500),
    windGusts: metric(c.wind_gusts_10m, u.wind_gusts_10m, "km/h", 0, 500),
    windDirection: metric(
      c.wind_direction_10m,
      u.wind_direction_10m,
      "°",
      0,
      360,
    ),
  };
  const hours = Array.isArray(h.time) && hu.time === "unixtime" ? h.time : [];
  const unique = [...new Set(hours.filter(finite))].sort((a, b) => a - b);
  const rows = unique
    .map((time) => {
      const i = hours.indexOf(time);
      return {
        validAt: timestamp(time),
        airTemperature: metric(
          h.temperature_2m?.[i],
          hu.temperature_2m,
          "°C",
          -90,
          65,
        ),
        windSpeed: metric(
          h.wind_speed_10m?.[i],
          hu.wind_speed_10m,
          "km/h",
          0,
          500,
        ),
        windGusts: metric(
          h.wind_gusts_10m?.[i],
          hu.wind_gusts_10m,
          "km/h",
          0,
          500,
        ),
        precipitation: metric(
          h.precipitation?.[i],
          hu.precipitation,
          "mm",
          0,
          1000,
        ),
      };
    })
    .filter((r) => r.validAt);
  // Hourly precipitation is the preceding-hour accumulation. Use complete hours only.
  const end = Math.floor(now / HOUR) * HOUR;
  const past = rows.filter(
    (r) =>
      Date.parse(r.validAt) > end - 48 * HOUR && Date.parse(r.validAt) <= end,
  );
  const complete =
    past.length === 48 &&
    past.every(
      (r, i) =>
        Date.parse(r.validAt) === end - (47 - i) * HOUR &&
        r.precipitation.value !== null,
    );
  const wetRows = complete
    ? past.filter((r) => r.precipitation.value > 0)
    : [];
  const rain48h = {
    value: complete
      ? Math.round(
          past.reduce((sum, r) => sum + r.precipitation.value, 0) * 10,
        ) / 10
      : null,
    unit: "mm",
    from: new Date(end - 48 * HOUR).toISOString(),
    to: new Date(end).toISOString(),
    kind: "model",
    wetHours: complete ? wetRows.length : null,
    lastPrecipitationAt: wetRows.length
      ? wetRows[wetRows.length - 1].validAt
      : null,
  };
  const forecast = rows.filter(
    (r) =>
      Date.parse(r.validAt) > now && Date.parse(r.validAt) <= now + 24 * HOUR,
  );
  let status = modelStatus(validAt, now);
  if (!Object.values(current).some((v) => v.value !== null))
    status = "unavailable";
  return {
    status,
    source: SOURCES.weather,
    validAt,
    observedAt: null,
    fetchedAt: new Date(now).toISOString(),
    grid: grid(data),
    current,
    rain48h,
    forecast,
  };
}
export function normaliseMarine(data, now = Date.now()) {
  const c = data.current || {},
    u = data.current_units || {};
  const validAt = u.time === "unixtime" ? timestamp(c.time) : null;
  const current = {
    seaTemperature: metric(
      c.sea_surface_temperature,
      u.sea_surface_temperature,
      "°C",
      -3,
      45,
    ),
    waveHeight: metric(c.wave_height, u.wave_height, "m", 0, 40),
    wavePeriod: metric(c.wave_period, u.wave_period, "s", 0, 50),
  };
  let status = modelStatus(validAt, now);
  if (!Object.values(current).some((v) => v.value !== null))
    status = "unavailable";
  return {
    status,
    source: SOURCES.marine,
    validAt,
    observedAt: null,
    fetchedAt: new Date(now).toISOString(),
    grid: grid(data),
    current,
  };
}
export function providerURL(spot, provider, apiKey = "") {
  const marine = provider === "marine";
  const host = marine
    ? apiKey
      ? "customer-marine-api.open-meteo.com"
      : "marine-api.open-meteo.com"
    : apiKey
      ? "customer-api.open-meteo.com"
      : "api.open-meteo.com";
  const url = new URL(`https://${host}/v1/${marine ? "marine" : "forecast"}`);
  const params = {
    latitude: spot.coordinates[0],
    longitude: spot.coordinates[1],
    timeformat: "unixtime",
    timezone: "Pacific/Auckland",
    current: marine
      ? "sea_surface_temperature,wave_height,wave_period"
      : "temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m",
  };
  if (!marine)
    Object.assign(params, {
      hourly: "temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m",
      forecast_hours: 25,
      past_hours: 48,
      temperature_unit: "celsius",
      wind_speed_unit: "kmh",
      precipitation_unit: "mm",
    });
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  if (apiKey) url.searchParams.set("apikey", apiKey);
  return url;
}
export async function fetchProvider(
  spot,
  provider,
  { fetchImpl = fetch, now = Date.now(), apiKey = "", timeoutMs = 8000 } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(providerURL(spot, provider, apiKey), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("Provider unavailable");
    const data = await response.json();
    if (!data || typeof data !== "object" || data.error)
      throw new Error("Invalid provider response");
    const result =
      provider === "marine"
        ? normaliseMarine(data, now)
        : normaliseWeather(data, now);
    if (result.status === "unavailable")
      throw new Error("No usable provider data");
    return result;
  } finally {
    clearTimeout(timer);
  }
}
function usable(feed, now) {
  return (
    feed &&
    ["fresh", "stale"].includes(feed.status) &&
    finite(Date.parse(feed.fetchedAt)) &&
    now - Date.parse(feed.fetchedAt) <= RETAIN_MS &&
    now - Date.parse(feed.fetchedAt) >= 0
  );
}
export async function getConditions(
  spot,
  {
    fetchImpl = fetch,
    now = Date.now(),
    apiKey = "",
    cached = null,
    timeoutMs = 8000,
  } = {},
) {
  async function one(provider) {
    const previous = cached?.[provider];
    if (
      usable(previous, now) &&
      previous.status === "fresh" &&
      modelStatus(previous.validAt, now) === "fresh" &&
      now - Date.parse(previous.fetchedAt) < REFRESH_MS
    )
      return previous;
    try {
      return await fetchProvider(spot, provider, {
        fetchImpl,
        now,
        apiKey,
        timeoutMs,
      });
    } catch {
      if (usable(previous, now))
        return {
          ...previous,
          status: "stale",
          message: "Refresh failed. Showing the last available model data.",
        };
      return {
        status: "unavailable",
        source: SOURCES[provider],
        fetchedAt: null,
        validAt: null,
        observedAt: null,
        message:
          "The provider could not return usable data. Try again shortly.",
      };
    }
  }
  const [weather, marine] = await Promise.all([
    one("weather"),
    spot.type === "sea"
      ? one("marine")
      : Promise.resolve({ status: "not-applicable" }),
  ]);
  return { schemaVersion: 1, spotId: spot.id, weather, marine };
}


const LAWA_GRADES = ["Excellent", "Good", "Fair", "Poor"];
const LAWA_RESULTS = [
  "Suitable for swimming",
  "Unsuitable for swimming",
  "Caution advised",
  "Good",
  "Fair",
  "Poor",
  "Excellent",
];

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');
}

export function parseLawaSwimHtml(html) {
  const text = decodeHtml(
    String(html || "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();

  let longTermGrade = null;
  const gradeMatch = text.match(
    new RegExp(`\\b(${LAWA_GRADES.join("|")})\\s+Long[- ]term grade\\b`, "i"),
  );
  if (gradeMatch) {
    longTermGrade = LAWA_GRADES.find(
      (g) => g.toLowerCase() === gradeMatch[1].toLowerCase(),
    ) || gradeMatch[1];
  }

  let latestResult = null;
  const labelledPatterns = [
    /Latest\s+(?:water\s+quality\s+)?result\s*[:–-]?\s*(Suitable for swimming|Unsuitable for swimming|Caution advised|Excellent|Good|Fair|Poor)/i,
    /(Suitable for swimming|Unsuitable for swimming|Caution advised)\s+(?:Latest\s+result|Issued:|Predicted water quality:)/i,
  ];
  for (const pattern of labelledPatterns) {
    const match = text.match(pattern);
    if (match) {
      latestResult = LAWA_RESULTS.find(
        (r) => r.toLowerCase() === match[1].toLowerCase(),
      ) || match[1];
      break;
    }
  }

  return { longTermGrade, latestResult };
}

export async function fetchLawaSwim(
  spot,
  { fetchImpl = fetch, timeoutMs = 8000 } = {},
) {
  const siteId = Number(spot?.lawa?.siteId);
  if (!Number.isInteger(siteId) || siteId <= 0)
    return { status: "unavailable", longTermGrade: null, latestResult: null };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const sourceUrl =
    spot.lawa?.embedUrl ||
    `https://embed.lawa.org.nz/swim/iframe/medium/550/500/${siteId}/`;

  try {
    const response = await fetchImpl(sourceUrl, {
      signal: controller.signal,
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    if (!response.ok) throw new Error("LAWA unavailable");
    const parsed = parseLawaSwimHtml(await response.text());
    return {
      status:
        parsed.longTermGrade || parsed.latestResult ? "available" : "unavailable",
      sourceUrl: spot.conditionsSource?.url || sourceUrl,
      fetchedAt: new Date().toISOString(),
      ...parsed,
    };
  } catch {
    return {
      status: "unavailable",
      sourceUrl: spot.conditionsSource?.url || sourceUrl,
      fetchedAt: null,
      longTermGrade: null,
      latestResult: null,
    };
  } finally {
    clearTimeout(timer);
  }
}


const QLDC_TOILETS_URL =
  "https://gis.qldc.govt.nz/server/rest/services/OpenSpaces/Parks_and_Open_Spaces_VIEWER/MapServer/26/query";

const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

function radians(value) {
  return (value * Math.PI) / 180;
}

export function distanceMetres(a, b) {
  const R = 6371000;
  const lat1 = radians(a[0]);
  const lat2 = radians(b[0]);
  const dLat = radians(b[0] - a[0]);
  const dLon = radians(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toiletName(tags = {}) {
  return (
    tags.name ||
    tags["toilets:name"] ||
    tags.operator ||
    tags.location ||
    "Public toilet"
  );
}


function qldcToiletName(attributes = {}) {
  return (
    attributes.SITENME ||
    attributes.ROAD ||
    attributes.SUBLOC ||
    attributes.ASSETID ||
    "QLDC public toilet"
  );
}

export async function fetchNearestQldcToilet(
  spot,
  { fetchImpl = fetch, timeoutMs = 9000, radius = 10000 } = {},
) {
  const [lat, lon] = spot.coordinates || [];
  const source = {
    name: "Queenstown Lakes District Council",
    url: "https://gis.qldc.govt.nz/server/rest/services/OpenSpaces/Parks_and_Open_Spaces_VIEWER/MapServer/26",
    kind: "council",
  };
  if (!finite(lat) || !finite(lon))
    return { status: "unavailable", source, toilet: null };

  const url = new URL(QLDC_TOILETS_URL);
  const params = {
    where: "OPSTAT='01'",
    outFields:
      "ASSETID,SITENME,ROAD,SUBLOC,OPSTAT,DUNIWC,DFWC,DMWC,BABYCHGE",
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    distance: String(radius),
    units: "esriSRUnit_Meter",
    outSR: "4326",
    returnGeometry: "true",
    f: "json",
  };
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("QLDC toilet provider unavailable");
    const data = await response.json();
    if (!Array.isArray(data?.features))
      throw new Error("Invalid QLDC toilet response");

    const candidates = data.features
      .map((feature) => {
        const tLat = feature.geometry?.y;
        const tLon = feature.geometry?.x;
        if (!finite(tLat) || !finite(tLon)) return null;
        const attributes = feature.attributes || {};
        const distance = distanceMetres([lat, lon], [tLat, tLon]);
        const disabled =
          ["01"].includes(attributes.DUNIWC) ||
          ["01"].includes(attributes.DFWC) ||
          ["01"].includes(attributes.DMWC);
        return {
          sourceId: attributes.ASSETID || null,
          name: qldcToiletName(attributes),
          coordinates: [tLat, tLon],
          distanceMetres: Math.round(distance),
          accessible: disabled ? true : null,
          babyChange: attributes.BABYCHGE === "01" ? true : null,
          operatingStatus: "open",
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distanceMetres - b.distanceMetres);

    return {
      status: candidates.length ? "available" : "none-found",
      source,
      toilet: candidates[0] || null,
      radiusMetres: radius,
    };
  } catch {
    return {
      status: "temporarily-unavailable",
      source,
      toilet: null,
      radiusMetres: radius,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchNearestToilet(
  spot,
  {
    fetchImpl = fetch,
    timeoutMs = 9000,
    radius = 10000,
    endpoints = OVERPASS_URLS,
  } = {},
) {
  const [lat, lon] = spot.coordinates || [];
  const source = {
    name: "OpenStreetMap",
    url: "https://www.openstreetmap.org/",
    licence: "ODbL",
  };
  if (!finite(lat) || !finite(lon))
    return {
      status: "unavailable",
      source,
      toilet: null,
      message: "This swim spot does not have usable coordinates.",
    };

  // Prefer QLDC's authoritative public-toilet asset layer where it returns
  // an open facility nearby. Outside the district, or if the council service
  // is unavailable, fall back to OpenStreetMap.
  const qldc = await fetchNearestQldcToilet(spot, {
    fetchImpl,
    timeoutMs,
    radius,
  });
  if (qldc.status === "available") return qldc;

  const query = `
[out:json][timeout:8];
(
  node["amenity"="toilets"](around:${radius},${lat},${lon});
  way["amenity"="toilets"](around:${radius},${lat},${lon});
  relation["amenity"="toilets"](around:${radius},${lat},${lon});
);
out center tags;
`;

  let successfulResponse = false;
  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
        },
        body: new URLSearchParams({ data: query }),
      });
      if (!response.ok) continue;

      const data = await response.json();
      if (!Array.isArray(data?.elements)) continue;
      successfulResponse = true;

      const candidates = data.elements
        .map((element) => {
          const tLat = element.lat ?? element.center?.lat;
          const tLon = element.lon ?? element.center?.lon;
          if (!finite(tLat) || !finite(tLon)) return null;
          const distance = distanceMetres([lat, lon], [tLat, tLon]);
          return {
            osmType: element.type,
            osmId: element.id,
            name: toiletName(element.tags),
            coordinates: [tLat, tLon],
            distanceMetres: Math.round(distance),
            accessible:
              element.tags?.wheelchair === "yes"
                ? true
                : element.tags?.wheelchair === "no"
                  ? false
                  : null,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.distanceMetres - b.distanceMetres);

      return {
        status: candidates.length ? "available" : "none-found",
        source,
        toilet: candidates[0] || null,
        radiusMetres: radius,
      };
    } catch {
      // Try the next public Overpass endpoint.
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    status: successfulResponse ? "none-found" : "temporarily-unavailable",
    source,
    toilet: null,
    radiusMetres: radius,
    message: successfulResponse
      ? `No mapped public toilet was found within ${Math.round(radius / 1000)} km.`
      : "Neither the council nor OpenStreetMap toilet lookup could be reached. Try again later.",
  };
}
