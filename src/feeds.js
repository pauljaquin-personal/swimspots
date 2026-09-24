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
  tide: {
    name: "MetService Tide API",
    url: "https://developer.metservice.com/docs/api-catalog/tide-api/",
    licence: "Provider terms apply",
    kind: "astronomical-model",
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
    tideApiKey = "",
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
  const [weather, marine, tide] = await Promise.all([
    one("weather"),
    spot.type === "sea"
      ? one("marine")
      : Promise.resolve({ status: "not-applicable" }),
    spot.type === "sea"
      ? usableTides(cached?.tide, now)
        ? Promise.resolve(cached.tide)
        : fetchTides(spot, {
            fetchImpl,
            now,
            apiKey: tideApiKey,
            timeoutMs,
          }).catch(() =>
            usableTides(cached?.tide, now)
              ? cached.tide
              : {
                  status: "unavailable",
                  source: SOURCES.tide,
                  fetchedAt: null,
                  datum: "LAT",
                  predictions: [],
                  message: "Tide predictions are temporarily unavailable.",
                },
          )
      : Promise.resolve({ status: "not-applicable" }),
  ]);
  return { schemaVersion: 1, spotId: spot.id, weather, marine, tide };
}


export const TIDE_REFRESH_MS = 24 * 60 * 60_000;
const TIDE_MODEL_ID = "tpxo9_glob_v9.4";

export function tideURL(spot) {
  const url = new URL(
    `https://api.marine.metservice.com/tide/v4/models/${TIDE_MODEL_ID}/tidetimes/points`,
  );
  url.searchParams.set("latitudes", String(spot.coordinates[0]));
  url.searchParams.set("longitudes", String(spot.coordinates[1]));
  url.searchParams.set("datum", "LAT");
  return url;
}

export function normaliseTides(data, now = Date.now()) {
  const location = Array.isArray(data?.locations) ? data.locations[0] : null;
  const predictions = Array.isArray(location?.predictions)
    ? location.predictions
    : [];
  const unit =
    data?.metadata?.units?.sea_surface_elevation === "m" ? "m" : "m";
  const rows = predictions
    .map((p) => ({
      time:
        typeof p?.time === "string" && Number.isFinite(Date.parse(p.time))
          ? new Date(p.time).toISOString()
          : null,
      stage: p?.tidal_stage === "high" || p?.tidal_stage === "low"
        ? p.tidal_stage
        : null,
      height: finite(p?.sea_surface_elevation)
        ? { value: p.sea_surface_elevation, unit }
        : { value: null, unit },
    }))
    .filter((p) => p.time && p.stage)
    .filter((p) => Date.parse(p.time) >= now - 2 * HOUR)
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
    .slice(0, 8);
  return {
    status: rows.length ? "fresh" : "unavailable",
    source: SOURCES.tide,
    fetchedAt: new Date(now).toISOString(),
    datum: data?.metadata?.datum || "LAT",
    modelId: data?.metadata?.model_id || TIDE_MODEL_ID,
    grid: location?.coordinates || null,
    predictions: rows,
  };
}

export async function fetchTides(
  spot,
  {
    fetchImpl = fetch,
    now = Date.now(),
    apiKey = "",
    timeoutMs = 8000,
  } = {},
) {
  if (!apiKey) {
    return {
      status: "unavailable",
      source: SOURCES.tide,
      fetchedAt: null,
      datum: "LAT",
      predictions: [],
      message: "Tide predictions are not configured yet.",
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(tideURL(spot), {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `ApiKey ${apiKey}`,
      },
    });
    if (!response.ok) throw new Error("Tide provider unavailable");
    const data = await response.json();
    const result = normaliseTides(data, now);
    if (result.status === "unavailable")
      throw new Error("No usable tide predictions");
    return result;
  } finally {
    clearTimeout(timer);
  }
}

function usableTides(feed, now) {
  return (
    feed &&
    feed.status === "fresh" &&
    finite(Date.parse(feed.fetchedAt)) &&
    now - Date.parse(feed.fetchedAt) >= 0 &&
    now - Date.parse(feed.fetchedAt) < TIDE_REFRESH_MS &&
    Array.isArray(feed.predictions) &&
    feed.predictions.some((p) => Date.parse(p.time) > now)
  );
}
