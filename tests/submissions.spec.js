import { test, expect } from "@playwright/test";
for (const sourceUrl of ["", "https://www.orc.govt.nz/"]) {
  test("submit, review and publish with source " + (sourceUrl || "omitted"), async ({
    page,
  }, testInfo) => {
    const name = "Browser test " + crypto.randomUUID();
    await page.route("**/api/conditions?*", (r) =>
      r.fulfill({ status: 503, body: "offline" }),
    );
    await page.goto("/");
    await page.locator("#contribute").click();
    const form = page.locator("#suggest-form");
    for (const [field, value] of Object.entries({
      name,
      region: "Test region",
      waterbody: "Test water",
      latitude: testInfo.project.name.includes("mobile") ? "-43.33" : "-43.23",
      longitude: sourceUrl ? "171.73" : "171.23",
      description: "Test listing only",
      access: "Public access to be verified",
      hazards: "Unverified test hazards",
      sourceUrl,
    }))
      await form.locator(`[name="${field}"]`).fill(value);
    await form.locator("[name=consent]").check();
    await page
      .getByRole("button", { name: "Submit for review", exact: true })
      .click();
    await expect(page.locator("#suggest-status")).toContainText(
      /Suggestion received|Possible matches/,
    );
    if (await page.locator("#duplicate-confirm").isVisible())
      await page.locator("#duplicate-confirm").click();
    await expect(page.locator("#suggest-status")).toContainText(
      "Suggestion received",
    );
    await page.getByRole("button", { name: "Close suggestion" }).click();
    await page.getByRole("searchbox").fill(name);
    await expect(page.locator("#result-count")).toHaveText("0 spots to explore");
    await page.goto("/review.html");
    const card = page
      .locator(".review-card")
      .filter({ has: page.getByRole("heading", { name, exact: true }) });
    await expect(card).toBeVisible();
    await expect(card.getByRole("link", { name: "Open submitted source ↗" })).toHaveCount(sourceUrl ? 1 : 0);
    await card.locator("[name=name]").fill(name + " reviewed");
    await card.locator("[name=note]").fill("Automated test: checked the fixture");
    await card.getByRole("button", { name: "Approve and publish" }).click();
    await expect(card.getByRole("status")).toContainText("Confirm you checked");
    await card.locator("[name=reviewConfirmed]").check();
    await card.getByRole("button", { name: "Approve and publish" }).click();
    await expect(card).toHaveCount(0);
    await page.goto("/");
    await page.getByRole("searchbox").fill(name);
    await expect(page.locator("#result-count")).toHaveText("1 spot to explore");
    await page.locator(".spot-card button").first().evaluate((el) => el.click());
    await page.getByText("More about this spot", { exact: true }).click();
    await expect(
      page.getByText("Community location · reviewed", { exact: true }),
    ).toBeVisible();
    const credit = page.locator("#spot-content").getByRole("link", { name: "Community submission · reviewed" });
    await expect(credit).toHaveCount(sourceUrl ? 1 : 0);
    if (sourceUrl) await expect(credit).toHaveAttribute("href", sourceUrl);
  });
}

test("draft survives reload and failed delivery retains inputs", async ({
  page,
}) => {
  await page.route("**/api/submissions", (r) =>
    r.fulfill({
      status: 503,
      json: { error: "Temporarily unavailable; draft retained." },
    }),
  );
  await page.goto("/");
  await page.locator("#contribute").click();
  const form = page.locator("#suggest-form");
  await form.locator("[name=name]").fill("Draft location");
  await page.reload();
  await page.locator("#contribute").click();
  await expect(form.locator("[name=name]")).toHaveValue("Draft location");
  for (const [field, value] of Object.entries({
    region: "Otago",
    waterbody: "Lake",
    latitude: "-44.3",
    longitude: "169.5",
    description: "Description",
    access: "Access",
    hazards: "Unknown",
    sourceUrl: "https://www.orc.govt.nz/",
  }))
    await form.locator(`[name="${field}"]`).fill(value);
  await form.locator("[name=consent]").check();
  await page
    .getByRole("button", { name: "Submit for review", exact: true })
    .click();
  await expect(page.locator("#suggest-status")).toContainText("draft retained");
  await expect(form.locator("[name=name]")).toHaveValue("Draft location");
});
