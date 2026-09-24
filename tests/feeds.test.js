import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normaliseWeather,
  normaliseMarine,
  getConditions,
  providerURL,
  fetchProvider,
  normaliseTides,
  tideURL,
  fetchTides,
} from "../src/feeds.js";
import { handleRequest } from "../src/worker.js";
const now = Date.parse("2026-09-21T00:15:00Z"),
  hour = 3600000;
const spot = { id: "test", type: "lake", coordinates: [-45, 168] };
function weather() {
  const times = Array.from(
    { length: 73 },
    (_, i) => (Math.floor(now / hour) * hour + (i - 48) * hour) / 1000,
  );
  return {
    latitude: -45,
    longitude: 168,
    current_units: {
      time: "unixtime",
      temperature_2m: "°C",
      wind_speed_10m: "km/h",
      wind_gusts_10m: "km/h",
      wind_direction_10m: "°",
    },
    current: {
      time: now / 1000,
      temperature_2m: 0,
      wind_speed_10m: 0,
      wind_gusts_10m: 5,
      wind_direction_10m: 0,
    },
    hourly_units: {
      time: "unixtime",
      temperature_2m: "°C",
      wind_speed_10m: "km/h",
      wind_gusts_10m: "km/h",
      precipitation: "mm",
    },
    hourly: {
      time: times,
      temperature_2m: times.map(() => 12),
      wind_speed_10m: times.map(() => 10),
      wind_gusts_10m: times.map(() => 20),
      precipitation: times.map(() => 1),
    },
  };
}
const marine = () => ({
  current_units: {
    time: "unixtime",
    sea_surface_temperature: "°C",
    wave_height: "m",
    wave_period: "s",
  },
  current: {
    time: now / 1000,
    sea_surface_temperature: 12,
    wave_height: 0,
    wave_period: 5,
  },
});
test("preserves zero readings, model times, source, and a complete 48h precipitation sum", () => {
  const d = normaliseWeather(weather(), now);
  assert.equal(d.current.airTemperature.value, 0);
  assert.equal(d.current.windSpeed.value, 0);
  assert.equal(d.observedAt, null);
  assert.equal(d.validAt, new Date(now).toISOString());
  assert.equal(d.rain48h.value, 48);
  assert.equal(d.rain48h.wetHours, 48);
  assert.equal(d.rain48h.lastPrecipitationAt, new Date(Math.floor(now / hour) * hour).toISOString());
  assert.equal(d.forecast.length, 24);
  assert.equal(d.source.kind, "model");
});
test("nulls, numeric strings and wrong units never become legitimate zeroes", () => {
  const d = weather();
  d.current.temperature_2m = null;
  d.current.wind_speed_10m = "0";
  d.current_units.wind_gusts_10m = "m/s";
  const r = normaliseWeather(d, now);
  assert.equal(r.current.airTemperature.value, null);
  assert.equal(r.current.windSpeed.value, null);
  assert.equal(r.current.windGusts.value, null);
});
test("incomplete 48h precipitation window remains unavailable", () => {
  const d = weather();
  d.hourly.precipitation[10] = null;
  assert.equal(normaliseWeather(d, now).rain48h.value, null);
});
test("stale or future model times are labelled", () => {
  const d = weather();
  d.current.time = (now - 4 * hour) / 1000;
  assert.equal(normaliseWeather(d, now).status, "stale");
  d.current.time = (now + hour) / 1000;
  assert.equal(normaliseWeather(d, now).status, "unavailable");
});
test("marine preserves calm conditions and does not invent a tide/current", () => {
  const d = normaliseMarine(marine(), now);
  assert.equal(d.current.waveHeight.value, 0);
  assert.equal(d.current.seaTemperature.value, 12);
  assert.equal(d.current.tides, undefined);
});
test("lakes do not request marine data", async () => {
  const requests = [];
  const r = await getConditions(spot, {
    now,
    fetchImpl: async (url) => {
      requests.push(String(url));
      return Response.json(weather());
    },
  });
  assert.equal(requests.length, 1);
  assert.equal(r.marine.status, "not-applicable");
});
test("weather and marine fail independently", async () => {
  const r = await getConditions(
    { ...spot, type: "sea" },
    {
      now,
      fetchImpl: async (url) =>
        String(url).includes("marine-api")
          ? Response.json(marine())
          : new Response("", { status: 429 }),
    },
  );
  assert.equal(r.weather.status, "unavailable");
  assert.equal(r.marine.status, "fresh");
});
test("fresh cache avoids upstream calls", async () => {
  const cached = { weather: normaliseWeather(weather(), now) };
  const r = await getConditions(spot, {
    now: now + 60000,
    cached,
    fetchImpl: () => {
      throw Error("Should not fetch");
    },
  });
  assert.equal(r.weather.status, "fresh");
});
test("failed refresh retains old timestamp and marks stale, then expires", async () => {
  const cached = { weather: normaliseWeather(weather(), now) };
  const fetchImpl = async () => {
    throw Error("offline");
  };
  const r = await getConditions(spot, {
    now: now + 20 * 60000,
    cached,
    fetchImpl,
  });
  assert.equal(r.weather.status, "stale");
  assert.equal(r.weather.fetchedAt, cached.weather.fetchedAt);
  const expired = await getConditions(spot, {
    now: now + 61 * 60000,
    cached,
    fetchImpl,
  });
  assert.equal(expired.weather.status, "unavailable");
});
test("provider timeout aborts and recovers", async () => {
  const result = await getConditions(spot, {
    now,
    timeoutMs: 5,
    fetchImpl: (_url, { signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(Error("timeout"))),
      ),
  });
  assert.equal(result.weather.status, "unavailable");
});
test("malformed provider response fails closed", async () => {
  await assert.rejects(
    fetchProvider(spot, "weather", {
      now,
      fetchImpl: async () => Response.json({ current: { temperature_2m: 0 } }),
    }),
  );
});
test("weather provider requests 48 hours of past precipitation", () => {
  assert.equal(providerURL(spot, "weather").searchParams.get("past_hours"), "48");
});

test("paid key selects customer endpoint, never enters returned model data", async () => {
  assert.equal(
    providerURL(spot, "weather", "secret").hostname,
    "customer-api.open-meteo.com",
  );
  const data = await getConditions(spot, {
    now,
    apiKey: "secret",
    fetchImpl: async () => Response.json(weather()),
  });
  assert.ok(!JSON.stringify(data).includes("secret"));
});
test("worker rejects unknown IDs, arbitrary coordinates, duplicate IDs and methods", async () => {
  const env = { ASSETS: { fetch: async () => new Response("asset") } };
  let count = 0;
  const opts = {
    fetchImpl: async () => {
      count++;
      return Response.json(weather());
    },
    now,
    cache: null,
  };
  for (const [path, status] of [
    ["?spot=unknown", 404],
    ["?spot=queenstown-bay&latitude=0", 400],
    ["?spot=queenstown-bay&spot=roys-bay", 400],
  ]) {
    assert.equal(
      (
        await handleRequest(
          new Request("https://swimspots.test/api/conditions" + path),
          env,
          null,
          opts,
        )
      ).status,
      status,
    );
  }
  assert.equal(
    (
      await handleRequest(
        new Request(
          "https://swimspots.test/api/conditions?spot=queenstown-bay",
          { method: "POST" },
        ),
        env,
        null,
        opts,
      )
    ).status,
    405,
  );
  assert.equal(count, 0);
});
test("worker serves assets and approved conditions; caches normalized results", async () => {
  const entries = new Map();
  const cache = {
    match: async (r) => entries.get(r.url)?.clone(),
    put: async (r, data) => entries.set(r.url, data),
  };
  const env = { ASSETS: { fetch: async () => new Response("asset") } };
  let calls = 0;
  const options = {
    now,
    cache,
    fetchImpl: async () => {
      calls++;
      return Response.json(weather());
    },
  };
  assert.equal(
    await (
      await handleRequest(
        new Request("https://swimspots.test/"),
        env,
        null,
        options,
      )
    ).text(),
    "asset",
  );
  const req = new Request(
    "https://swimspots.test/api/conditions?spot=queenstown-bay",
  );
  assert.equal(
    (await (await handleRequest(req, env, null, options)).json()).weather
      .status,
    "fresh",
  );
  await handleRequest(req, env, null, options);
  assert.equal(calls, 1);
});

test("tide adapter returns ordered high and low water predictions", () => {
  const data = {
    metadata: {
      model_id: "tpxo9_glob_v9.4",
      datum: "LAT",
      units: { sea_surface_elevation: "m" },
    },
    locations: [
      {
        coordinates: { latitude: -45.9, longitude: 170.5 },
        predictions: [
          {
            time: new Date(now + 2 * hour).toISOString(),
            sea_surface_elevation: 1.8,
            tidal_stage: "high",
          },
          {
            time: new Date(now + 8 * hour).toISOString(),
            sea_surface_elevation: 0.4,
            tidal_stage: "low",
          },
        ],
      },
    ],
  };
  const tide = normaliseTides(data, now);
  assert.equal(tide.status, "fresh");
  assert.equal(tide.predictions.length, 2);
  assert.equal(tide.predictions[0].stage, "high");
  assert.equal(tide.predictions[0].height.value, 1.8);
  assert.equal(tide.datum, "LAT");
});

test("tide URL uses known spot coordinates and global model", () => {
  const url = tideURL({ ...spot, type: "sea" });
  assert.equal(url.hostname, "api.marine.metservice.com");
  assert.match(url.pathname, /tpxo9_glob_v9\.4\/tidetimes\/points$/);
  assert.equal(url.searchParams.get("latitudes"), "-45");
  assert.equal(url.searchParams.get("longitudes"), "168");
});

test("tide provider requires configured API access and never exposes the key", async () => {
  const unavailable = await fetchTides({ ...spot, type: "sea" }, { now });
  assert.equal(unavailable.status, "unavailable");

  let auth = "";
  const result = await fetchTides(
    { ...spot, type: "sea" },
    {
      now,
      apiKey: "tide-secret",
      fetchImpl: async (_url, options) => {
        auth = options.headers.Authorization;
        return Response.json({
          metadata: {
            model_id: "tpxo9_glob_v9.4",
            datum: "LAT",
            units: { sea_surface_elevation: "m" },
          },
          locations: [
            {
              coordinates: { latitude: -45, longitude: 168 },
              predictions: [
                {
                  time: new Date(now + hour).toISOString(),
                  sea_surface_elevation: 1.2,
                  tidal_stage: "high",
                },
              ],
            },
          ],
        });
      },
    },
  );
  assert.equal(auth, "ApiKey tide-secret");
  assert.equal(result.status, "fresh");
  assert.ok(!JSON.stringify(result).includes("tide-secret"));
});
