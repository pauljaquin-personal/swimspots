import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
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
test("renders real feed contract, zeros, sources and lazy official LAWA report", async ({
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
  await expect(page.locator(".condition").filter({ hasText: "From" }).locator("strong")).toHaveText("S");
  await expect(page.getByText("0.0 mm", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Weather" })).toBeVisible();
  await expect(page.getByText("Rain 48h", { exact: true })).toBeVisible();
  await page.getByText("Weather details & forecast", { exact: true }).click();
  await expect(
    page.getByText("Model estimate, not a station observation."),
  ).toBeVisible();
  await expect(page.locator(".lawa-scroll iframe")).toHaveCount(0);
  await page
    .getByText("About this water-quality source", { exact: true })
    .click();
  await page
    .getByText("Show embedded LAWA report", { exact: true })
    .click();
  await expect(page.locator(".lawa-scroll iframe")).toHaveAttribute(
    "src",
    /40722/,
  );
  expect(
    await page.locator("body").evaluate((el) => el.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
});
test("failed conditions can retry without hiding the water report", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/conditions?*", (r) =>
    ++calls === 1
      ? r.fulfill({ status: 503, body: "offline" })
      : r.fulfill({ json: feed() }),
  );
  await page.goto("/#spot=queenstown-bay");
  await expect(page.getByText(/Conditions unavailable/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open ↗" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Refresh/ }).click();
  await expect(page.getByText("0.0 °C", { exact: true })).toBeVisible();
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

test("recent modelled precipitation shows a 48-hour runoff reminder", async ({
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
  await expect(
    page.getByText(/Rain in the past 48 hours/),
  ).toBeVisible();
  await expect(page.getByText(/Check water-quality advice/)).toBeVisible();
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
  await expect(page.locator(".conditions-column-weather").getByText("Weather", { exact: true })).toBeVisible();
  await expect(page.locator(".conditions-column-water").getByText("Water quality · LAWA", { exact: true })).toBeVisible();
  await expect(page.getByText("14.2 °C", { exact: true })).toBeVisible();
  await expect(page.locator(".conditions-column-water").getByText("Sea conditions", { exact: true })).toBeVisible();
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

test("exact LAWA matches show the official site response directly", async ({ page }) => {
  await page.route("**/api/conditions?*", (r) => r.fulfill({ json: feed() }));
  await page.goto("/#spot=queenstown-bay");
  const iframe = page.locator(".water-quality-card .lawa-direct iframe");
  await expect(iframe).toHaveCount(1);
  await expect(iframe).toHaveAttribute("src", /40722/);
  await expect(page.locator(".water-quality-card").getByText("Source:")).toBeVisible();
});

test("unmapped LAWA locations show a restrained fallback", async ({ page }) => {
  const d = feed("porpoise-bay");
  d.marine = { status: "not-applicable" };
  await page.route("**/api/conditions?*", (r) => r.fulfill({ json: d }));
  await page.goto("/#spot=porpoise-bay");
  await expect(page.getByText("LAWA site panel not yet connected", { exact: true })).toBeVisible();
  await expect(page.locator(".water-quality-card .lawa-direct iframe")).toHaveCount(0);
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
