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
  await expect(page.locator(".condition").filter({ hasText: "Wind from" }).locator("strong")).toHaveText("S");
  const headings = await page.locator("#spot-content h3").allTextContents();
  expect(headings.indexOf("Access & local knowledge")).toBeLessThan(headings.indexOf("Weather at this spot"));
  await expect(page.getByText("0.0 mm", { exact: true })).toBeVisible();
  await expect(
    page.getByText("No precipitation is shown by the model for the completed hours in the past 48 hours."),
  ).toBeVisible();
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
  await expect(page.getByText(/Conditions could not refresh/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open ↗" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refresh conditions" }).click();
  await expect(page.getByText("0.0 °C", { exact: true })).toBeVisible();
});
test("stale cache is labelled", async ({ page }) => {
  await page.route("**/api/conditions?*", (r) =>
    r.fulfill({ json: feed("queenstown-bay", "stale") }),
  );
  await page.goto("/#spot=queenstown-bay");
  await expect(
    page.getByText("Older model data — refresh needed"),
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
  await page
    .getByRole("button", { name: "View Roys Bay", exact: true })
    .click();
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
    page.getByText(/Modelled precipitation occurred within the past 48 hours/),
  ).toBeVisible();
  await expect(page.getByText(/Recent rain can increase runoff/)).toBeVisible();
});
