import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/community-spots", (r) =>
    r.fulfill({ json: { spots: [], submissionsEnabled: true } }),
  );
  await page.route("**/api/conditions?*", (r) =>
    r.fulfill({ status: 503, body: "unavailable" }),
  );
});
test("search, filter, details, saved persistence and empty state", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".spot-card")).toHaveCount(60);
  await page.getByRole("searchbox").fill("wanaka");
  await expect(page.locator(".spot-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "View Roys Bay", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Roys Bay", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Water quality · LAWA" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add photo or local knowledge", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Add to Roys Bay", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Spot name", { exact: true })).toHaveValue(
    "Roys Bay",
  );
  await page.getByRole("button", { name: "Close suggestion" }).click();
  await page.goto("/");
  await page.getByRole("searchbox").fill("wanaka");
  await page
    .getByRole("button", { name: "View Roys Bay", exact: true })
    .click();
  await page.getByRole("button", { name: "☆ Save spot", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#spot-dialog")).not.toBeVisible();
  await expect(page).toHaveURL("http://127.0.0.1:4173/");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Unsave Roys Bay" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Saved 1/ }).click();
  await expect(page.locator(".spot-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Reset search and filters", exact: true }).click();
  await page.getByRole("button", { name: "Pools", exact: true }).click();
  await expect(page.getByText("No spots found just yet.")).toBeVisible();
  await page.getByRole("button", { name: "Reset search and filters", exact: true }).click();
  await page.locator("#region").selectOption("Auckland");
  await expect(page.locator(".spot-card")).toHaveCount(1);
  expect(
    await page.locator("body").evaluate((el) => el.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
});
test("deep link and suggestion form", async ({ page }) => {
  await page.goto("/#spot=queenstown-bay");
  await expect(
    page.getByRole("heading", { name: "Queenstown Bay", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close spot details" }).click();
  await page.locator("#contribute").click();
  await expect(
    page.getByRole("button", { name: "Submit for review", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Latitude", { exact: true })).toBeVisible();
});
test("location permission denial gives recovery", async ({ page, context }) => {
  await context.clearPermissions();
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_ok, error) =>
      error({ code: 1 });
  });
  await page.goto("/");
  await page.locator("#near").click();
  await expect(page.locator("#location-status")).toContainText(
    "search by town",
  );
});
test("location sorts spots nearest first", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: -36.848, longitude: 174.831 });
  await page.goto("/");
  await expect(page.locator(".spot-card")).toHaveCount(60);
  await page.locator("#near").click();
  await expect(page.locator(".spot-card").first()).toContainText("Mission Bay");
  await expect(page.locator(".spot-card").first()).toContainText("0.0 km");
});
test("data failure is recoverable", async ({ page }) => {
  await page.route("**/data/spots.json", (r) =>
    r.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.goto("/");
  await expect(page.getByText("Spots could not load")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});
test("tile failure preserves searchable list", async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
  await page.goto("/");
  await expect(page.locator("#map-status")).toBeVisible();
  await page.getByRole("searchbox").fill("queenstown");
  await expect(page.locator(".spot-card")).toHaveCount(1);
});

test("submit button is re-enabled when contributing to another existing spot", async ({ page }) => {
  await page.route("**/api/submissions", (r) =>
    r.fulfill({ status: 201, json: { id: crypto.randomUUID(), status: "pending" } }),
  );
  await page.goto("/");
  await page.getByRole("searchbox").fill("Roys Bay");
  await page.getByRole("button", { name: "View Roys Bay", exact: true }).click();
  await page
    .getByRole("button", { name: "Add photo or local knowledge", exact: true })
    .click();
  const form = page.locator("#suggest-form");
  await form.locator("[name=consent]").check();
  const submit = page.getByRole("button", {
    name: "Submit update for review",
    exact: true,
  });
  await submit.click();
  await expect(page.locator("#suggest-status")).toContainText("Update received");
  await expect(submit).toBeDisabled();
  await page.getByRole("button", { name: "Close suggestion" }).click();

  await page.getByRole("searchbox").fill("Lake Te Anau");
  await page
    .getByRole("button", { name: "View Lake Te Anau – Boat Harbour Beach", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add photo or local knowledge", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Submit update for review", exact: true }),
  ).toBeEnabled();
});

test("planner layout is full width on wide screens", async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1000 });
  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/planner-layout/);
  const metrics = await page.evaluate(() => {
    const header = document.querySelector("header").getBoundingClientRect();
    const main = document.querySelector("main").getBoundingClientRect();
    const explorer = document.querySelector(".explorer").getBoundingClientRect();
    const sidebar = document.querySelector(".sidebar").getBoundingClientRect();
    return {
      viewport: innerWidth,
      headerWidth: header.width,
      mainWidth: main.width,
      explorerWidth: explorer.width,
      headerLeft: header.left,
      explorerLeft: explorer.left,
      sidebarLeft: sidebar.left,
    };
  });
  expect(metrics.headerLeft).toBe(0);
  expect(metrics.explorerLeft).toBe(0);
  expect(metrics.headerWidth).toBeGreaterThanOrEqual(metrics.viewport - 1);
  expect(metrics.mainWidth).toBeGreaterThanOrEqual(metrics.viewport - 1);
  expect(metrics.explorerWidth).toBeGreaterThanOrEqual(metrics.viewport - 1);
  expect(metrics.sidebarLeft).toBeGreaterThan(0);
});

test("spot details use compact icon disclosures", async ({ page }) => {
  await page.goto("/#spot=queenstown-bay");
  await expect(page.getByText("Access", { exact: true })).toBeVisible();
  await expect(page.getByText("Parking", { exact: true })).toBeVisible();
  await expect(page.getByText("Facilities", { exact: true })).toBeVisible();
  await expect(page.getByText("Hazards", { exact: true })).toBeVisible();
  await expect(page.locator(".spot-quick-grid details[open]")).toHaveCount(0);
  await page.getByText("Access", { exact: true }).click();
  await expect(page.locator(".spot-quick-grid details[open]")).toHaveCount(1);
  await expect(page.getByText("More about this spot", { exact: true })).toBeVisible();
});

test("planner sidebar keeps result count accessible but visually minimal", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Search swim spots", { exact: true })).not.toBeVisible();
  await expect(page.locator("#result-count")).toHaveClass(/sr-only/);
  await expect(page.locator(".collection-note")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Reset search and filters", exact: true }),
  ).toBeVisible();
});

test("planner panel shows only the search bar by default", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByPlaceholder("Where can I swim?")).toBeVisible();
  await expect(page.locator(".filters")).not.toBeVisible();
  await expect(page.locator(".filter-row")).not.toBeVisible();
  await expect(page.locator(".results")).not.toBeVisible();
  await expect(page.locator(".spot-card").first()).not.toBeVisible();
});

test("mobile map fills the viewport behind the search bar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const metrics = await page.evaluate(() => {
    const map = document.querySelector(".map-wrap").getBoundingClientRect();
    const explorer = document.querySelector(".explorer").getBoundingClientRect();
    const sidebar = document.querySelector(".sidebar").getBoundingClientRect();
    return {
      viewport: innerHeight,
      mapBottom: map.bottom,
      explorerBottom: explorer.bottom,
      sidebarBottom: sidebar.bottom,
    };
  });
  expect(metrics.mapBottom).toBeGreaterThanOrEqual(metrics.viewport - 2);
  expect(metrics.explorerBottom).toBeGreaterThanOrEqual(metrics.viewport - 2);
  expect(metrics.sidebarBottom).toBeLessThanOrEqual(metrics.viewport);
});

test("map toolbar opens water-type layers and uses my-location control", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: -36.8485, longitude: 174.7633 });
  await page.goto("/");
  await expect(page.locator("#layers-panel")).toBeHidden();
  await page.getByRole("button", { name: "Choose water types" }).click();
  await expect(page.locator("#layers-panel")).toBeVisible();
  await expect(page.getByRole("button", { name: "Lakes", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rivers", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sea", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Centre map on my location" }).click();
  await expect(page.locator("#location-status")).toHaveText("Centred on your location");
});

test("mobile search toolbar stays at the top-left of the map", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const box = await page.locator(".sidebar").boundingBox();
  expect(box).not.toBeNull();
  expect(box.y).toBeLessThan(80);
  expect(box.x).toBeLessThan(20);
});

test("minimal bottom bar exposes about, contact, share and social actions", async ({ page }) => {
  await page.goto("/");
  for (const name of ["About Swimspots", "Contact Swimspots", "Share Swimspots", "Social links"]) {
    await expect(page.getByRole("button", { name })).toBeVisible();
  }
  await page.getByRole("button", { name: "About Swimspots" }).click();
  await expect(page.getByRole("heading", { name: "About Swimspots" })).toBeVisible();
  await page.getByRole("button", { name: "Close site information" }).click();
});
