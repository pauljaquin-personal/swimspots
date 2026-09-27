import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/lawa?*", r => r.abort());
  await page.route("**/api/community-spots", (r) =>
    r.fulfill({ json: { spots: [] } }),
  );
});
function feed(spotId = "queenstown-bay", status = "fresh") {
  const now = Date.now();
  return {
    spotId,
    weather: {
      status,
      source: {
        name: "Open-Meteo",
        url: "https://open-meteo.com/",
        licence: "CC BY 4.0",
      },
      validAt: new Date(now).toISOString(),
      fetchedAt: new Date(
        status === "stale" ? now - 1800000 : now,
      ).toISOString(),
      current: {
        airTemperature: { value: 0, unit: "°C" },
        windSpeed: { value: 12, unit: "km/h" },
        windGusts: { value: 23, unit: "km/h" },
        windDirection: { value: 180, unit: "°" },
      },
      rain48h: {
        value: 0,
        unit: "mm",
        from: new Date(now - 172800000).toISOString(),
        to: new Date(now).toISOString(),
        wetHours: 0,
        lastPrecipitationAt: null,
      },
      forecast: [],
    },
    marine: { status: "not-applicable" },
  };
}
test("renders real feed contract, zeros, sources and LAWA link", async ({
  page,
}) => {
  await page.route("**/api/conditions?*", (r) => r.fulfill({ json: feed() }));
  await page.route("https://embed.lawa.org.nz/**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<p>Official report fixture</p>",
    }),
  );
  await page.goto("/#spot=queenstown-bay");
  await expect(page.getByText("0.0 °C", { exact: true })).toBeVisible();
  await expect(page.getByText("Water temp", { exact: true })).toBeVisible();
  await expect(page.getByText("N/A", { exact: true })).toBeVisible();
  await expect(page.locator(".weather-fact").filter({ hasText: "Wind direction" }).locator("p")).toHaveText("S");

  await expect(page.getByRole("heading", { name: "Weather", exact: true })).toHaveCount(0);
  await expect(page.getByText("Last rain", { exact: true })).toBeVisible();
  await page.getByText("Weather details & forecast", { exact: true }).click();
  await expect(
    page.getByText("Model estimate, not a station observation."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "View this site on LAWA ↗" })).toHaveAttribute("href", /queenstown-bay/);
  expect(
    await page.locator("body").evaluate((el) => el.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
});
test("failed conditions leave the water report visible", async ({ page }) => {
  await page.route("**/api/conditions?*", r => r.fulfill({ status: 503, body: "offline" }));
  await page.goto("/#spot=queenstown-bay");
  await expect(page.getByText("Conditions unavailable.", { exact: true })).toBeVisible();
  await expect(page.locator(".lawa-latest strong")).toHaveText("No recent data");
});
test("stale cache is labelled", async ({ page }) => {
  await page.route("**/api/conditions?*", (r) =>
    r.fulfill({ json: feed("queenstown-bay", "stale") }),
  );
  await page.goto("/#spot=queenstown-bay");
  await page.getByText("Weather details & forecast", { exact: true }).click();
  await expect(
    page.getByText("Older model data — refresh needed."),
  ).toBeVisible();
});
test("switching spots cannot show the previous feed response", async ({
  page,
}) => {
  await page.route("**/api/conditions?spot=queenstown-bay", async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    try {
      await r.fulfill({ json: feed() });
    } catch {}
  });
  await page.route("**/api/conditions?spot=roys-bay", (r) => {
    const d = feed("roys-bay");
    d.weather.current.airTemperature.value = 18;
    return r.fulfill({ json: d });
  });
  await page.goto("/#spot=queenstown-bay");
  await page.getByRole("button", { name: "Close spot details" }).click();
  await expect(page.locator("#spot-dialog")).not.toBeVisible();
  await page.getByRole("searchbox").fill("Roys Bay");
  await page.locator(".spot-card button").first().evaluate((el) => el.click());
  await expect(page.getByText("18.0 °C", { exact: true })).toBeVisible();
  await expect(page.locator("#spot-title")).toHaveText("Roys Bay");
});

test("recent modelled precipitation shows the last-rain time", async ({
  page,
}) => {
  const d = feed();
  d.weather.rain48h = {
    value: 6.4,
    unit: "mm",
    from: new Date(Date.now() - 172800000).toISOString(),
    to: new Date().toISOString(),
    wetHours: 3,
    lastPrecipitationAt: new Date(Date.now() - 2 * 3600000).toISOString(),
  };
  await page.route("**/api/conditions?*", (r) => r.fulfill({ json: d }));
  await page.goto("/#spot=queenstown-bay");
  await expect(page.locator(".water-quality-rain").getByText("Last rain", { exact: true })).toBeVisible();
  await expect(page.locator(".water-quality-rain strong")).not.toHaveText("No rain in the last 48 hours");
});

test("conditions use two columns and coastal water temperature comes from marine feed", async ({ page }) => {
  const d = feed("porpoise-bay");
  d.marine = {
    status: "fresh",
    source: { name: "Open-Meteo", url: "https://open-meteo.com/", licence: "CC BY 4.0" },
    validAt: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    current: {
      seaTemperature: { value: 14.2, unit: "°C" },
      waveHeight: { value: 0.8, unit: "m" },
      wavePeriod: { value: 7, unit: "s" },
    },
  };
  await page.route("**/api/conditions?*", (r) => r.fulfill({ json: d }));
  await page.goto("/#spot=porpoise-bay");

  await expect(page.locator(".conditions-layout")).toBeVisible();
  await expect(page.locator(".weather-fact")).toHaveCount(4);
  await expect(page.locator(".conditions-column-water").getByText("Water quality", { exact: true })).toBeVisible();
  await expect(page.getByText("14.2 °C", { exact: true })).toBeVisible();
  await page.locator(".listing-details > summary").click();
  await expect(page.locator(".listing-details").getByText("Sea conditions", { exact: true })).toBeVisible();
  await expect(page.getByText("Sea temp", { exact: true })).toHaveCount(0);
});

test("weather details span both condition columns", async ({ page }) => {
  await page.route("**/api/conditions?*", (r) => r.fulfill({ json: feed() }));
  await page.goto("/#spot=queenstown-bay");
  await expect(page.locator(".weather-details-slot .weather-details-full")).toHaveCount(1);
  const [grid, details] = await Promise.all([
    page.locator(".conditions-layout").boundingBox(),
    page.locator(".weather-details-slot").boundingBox(),
  ]);
  expect(grid).not.toBeNull();
  expect(details).not.toBeNull();
  expect(Math.abs(details.width - grid.width)).toBeLessThan(3);
});

test("listing disclosure contains LAWA source information and sea conditions", async ({ page }) => {
  const d = feed("porpoise-bay");
  d.marine = {
    status: "fresh",
    source: { name: "Open-Meteo", url: "https://open-meteo.com/", licence: "CC BY 4.0" },
    validAt: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    current: {
      seaTemperature: { value: 14.2, unit: "°C" },
      waveHeight: { value: 0.8, unit: "m" },
      wavePeriod: { value: 7, unit: "s" },
    },
  };
  await page.route("**/api/conditions?*", (r) => r.fulfill({ json: d }));
  await page.goto("/#spot=porpoise-bay");
  await page.locator(".listing-details > summary").click();
  await expect(page.locator(".listing-details").getByText("Water quality source", { exact: true })).toBeVisible();
  await expect(page.locator(".listing-details").getByText("Sea conditions", { exact: true })).toBeVisible();
  await expect(page.locator(".conditions-column-water").getByText("Sea conditions", { exact: true })).toHaveCount(0);
});

test("unmapped LAWA locations retain the source link and unavailable summary", async ({ page }) => {
  await page.route("**/api/conditions?*", r => r.fulfill({ json: feed("porpoise-bay") }));
  await page.goto("/#spot=porpoise-bay");
  await expect(page.locator(".lawa-latest strong")).toHaveText("Unavailable");
  await expect(page.locator(".lawa-site-link")).toBeVisible();
});

test("water quality shows compact LAWA latest result and long-term grade", async ({ page }) => {
  await page.route("**/api/conditions?*", (r) => r.fulfill({ json: feed() }));
  await page.route("**/api/lawa?*", (r) =>
    r.fulfill({
      json: {
        status: "available",
        latest: "No recent data",
        longTerm: "Excellent",
        pageUrl: "https://www.lawa.org.nz/explore-data/otago-region/swimming/lake-whakatipu-wakatipu-at-queenstown-bay/swimsite",
      },
    }),
  );
  await page.goto("/#spot=queenstown-bay");
  await expect(page.locator(".lawa-latest").getByText("No recent data", { exact: true })).toBeVisible();
  await expect(page.locator(".lawa-long-term").getByText("Excellent", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "View this site on LAWA ↗" })).toHaveAttribute(
    "href",
    /queenstown-bay\/swimsite$/,
  );
});

test("Queenstown Bay has a verified LAWA fallback when live parsing is unavailable", async ({ page }) => {
  await page.route("**/api/conditions?*", (r) => r.fulfill({ json: feed() }));
  await page.route("**/api/lawa?*", (r) =>
    r.fulfill({
      json: {
        status: "available",
        latest: "No recent data",
        longTerm: "Excellent",
        pageUrl: "https://www.lawa.org.nz/explore-data/otago-region/swimming/lake-whakatipu-wakatipu-at-queenstown-bay/swimsite",
        source: "LAWA",
      },
    }),
  );
  await page.goto("/#spot=queenstown-bay");
  await expect(page.locator(".lawa-latest").getByText("No recent data", { exact: true })).toBeVisible();
  await expect(page.locator(".lawa-long-term").getByText("Excellent", { exact: true })).toBeVisible();
});

test("Queenstown Bay shows stored LAWA values even if the summary API fails", async ({ page }) => {
  await page.route("**/api/conditions?*", (r) => r.fulfill({ json: feed() }));
  await page.route("**/api/lawa?*", (r) => r.abort());
  await page.goto("/#spot=queenstown-bay");
  await expect(page.locator(".lawa-latest").getByText("No recent data", { exact: true })).toBeVisible();
  await expect(page.locator(".lawa-long-term").getByText("Excellent", { exact: true })).toBeVisible();
});

test("weather summary uses a clean two-by-two layout and rainfall sits with water quality", async ({ page }) => {
  await page.route("**/api/conditions?*", (r) => r.fulfill({ json: feed() }));
  await page.route("**/api/lawa?*", (r) =>
    r.fulfill({ json: { status: "available", latest: "No recent data", longTerm: "Excellent" } }),
  );
  await page.goto("/#spot=queenstown-bay");

  for (const label of ["Water temp", "Air temp", "Wind speed", "Wind direction"]) {
    await expect(page.locator(".conditions-column-weather").getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.locator(".conditions-column-weather").getByText("Gusts", { exact: true })).toHaveCount(0);
  await expect(page.locator(".conditions-column-water").getByText("Last rain", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Refresh/ })).toHaveCount(0);
  await expect(page.getByText("Updated", { exact: true })).toHaveCount(0);
});

test("water quality heading aligns first, followed by last-rain card then LAWA", async ({ page }) => {
  const d = feed();
  d.weather.rain48h.value = 8.5;
  d.weather.rain48h.lastPrecipitationAt = "2026-09-25T08:00:00+12:00";
  await page.route("**/api/conditions?*", (r) => r.fulfill({ json: d }));
  await page.route("**/api/lawa?*", (r) =>
    r.fulfill({ json: { status: "available", latest: "No recent data", longTerm: "Excellent" } }),
  );
  await page.goto("/#spot=queenstown-bay");

  const right = page.locator(".conditions-column-water");
  await expect(right.getByText("Last rain", { exact: true })).toBeVisible();
  const labels = await right.locator(":scope > *").evaluateAll((els) =>
    els.map((el) => (el.textContent || "").trim()),
  );
  expect(labels[0]).toBe("Water quality");
  expect(labels[1]).toContain("Last rain");
  expect(labels[2]).toContain("Latest result");
  await expect(right.getByText("Rain in last 48 hours", { exact: true })).toHaveCount(0);
  await expect(right.getByText("Last rain", { exact: true })).toBeVisible();
  await expect(right.getByText("8.5 mm", { exact: true })).toHaveCount(0);
});

test("weather facts match spot facts and detail dividers are absent", async ({ page }) => {
  await page.route("**/api/conditions?*", r => r.fulfill({ json: feed() }));
  await page.goto("/#spot=queenstown-bay");
  const facts = page.locator(".weather-fact");
  await expect(facts.locator("strong")).toHaveText(["Water temp", "Air temp", "Wind speed", "Wind direction"]);
  await expect(facts.locator("p")).toHaveText(["N/A", "0.0 °C", "12.0 km/h", "S"]);
  for (const fact of await facts.all()) {
    await expect(fact).toHaveCSS("border-top-width", "0px");
    await expect(fact).toHaveCSS("border-bottom-width", "0px");
    await expect(fact).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(fact.locator(".ui-icon")).toHaveAttribute("aria-hidden", "true");
    await expect(fact.locator("strong")).toHaveCSS("font-weight", "700");
    await expect(fact.locator("p")).toHaveCSS("font-weight", "400");
  }
  for (const section of await page.locator("#spot-content .spot-facts, #spot-content .spot-fact, #spot-content .feed-section, #spot-content .listing-info-section").all()) {
    await expect(section).toHaveCSS("border-top-width", "0px");
    await expect(section).toHaveCSS("border-bottom-width", "0px");
  }
  const boxes = await facts.evaluateAll(els => els.map(el => { const b = el.getBoundingClientRect(); return {x:b.x,y:b.y}; }));
  expect(boxes[0].y).toBe(boxes[1].y);
  expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
  expect(boxes[0].x).toBe(boxes[2].x);
});
