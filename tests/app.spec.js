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
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.getByRole("button", { name: "Pools", exact: true }).click();
  await expect(page.getByText("No spots found just yet.")).toBeVisible();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
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

test("design lab switches themes and preserves the selected URL", async ({ page }) => {
  await page.goto("/?theme=coastal");
  await expect(page.locator("body")).toHaveAttribute("data-theme", "coastal");
  await expect(
    page.getByRole("button", { name: "Coastal", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Editorial", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-theme", "editorial");
  await expect(page).toHaveURL(/theme=editorial/);

  await page.getByRole("button", { name: "Map-first", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-theme", "utility");
  await expect(page).toHaveURL(/theme=utility/);

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-theme", "planner");
  await expect(page).toHaveURL(/theme=planner/);
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(page.locator("#map")).toBeVisible();

  await page.getByRole("button", { name: "Current", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-theme", "current");
  await expect(page).not.toHaveURL(/theme=/);
});
