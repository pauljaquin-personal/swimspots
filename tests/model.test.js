import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectSpots, distanceKm } from "../public/model.js";
const { spots } = JSON.parse(
  readFileSync(new URL("../public/data/spots.json", import.meta.url)),
);
test("search tolerates macrons, whitespace and casing", () =>
  assert.equal(selectSpots(spots, { query: "  WANAKA  " })[0].id, "roys-bay"));
test("filters intersect and saved-only respects category", () =>
  assert.deepEqual(
    selectSpots(spots, {
      type: "sea",
      savedOnly: true,
      saved: ["mission-bay", "roys-bay"],
    }).map((s) => s.id),
    ["mission-bay"],
  ));
test("nearest sort uses geographic distance without mutating source", () => {
  const first = spots[0];
  assert.equal(
    selectSpots(spots, { location: [-36.848, 174.831] })[0].id,
    "mission-bay",
  );
  assert.equal(spots[0], first);
  assert.equal(distanceKm([0, 0], [0, 0]), 0);
  assert.ok(Math.abs(distanceKm([0, 0], [0, 1]) - 111.195) < 0.01);
});
test("seed records have unique ids, valid NZ coordinates and honest missing conditions", () => {
  assert.equal(new Set(spots.map((s) => s.id)).size, spots.length);
  for (const s of spots) {
    assert.ok(s.coordinates[0] < -34 && s.coordinates[0] > -48);
    assert.ok(s.coordinates[1] > 165 && s.coordinates[1] < 179);
    assert.ok(new URL(s.source.url).protocol === "https:");
    for (const c of Object.values(s.conditions)) {
      assert.equal(c.status, "unavailable");
      assert.equal(c.value, null);
      assert.equal(c.observedAt, null);
    }
  }
});

test("wind direction uses all 16 compass points and wraps at north", async () => {
  const { compassPoint } = await import("../public/model.js");
  const points = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  points.forEach((point, i) => assert.equal(compassPoint(i * 22.5), point));
  for (const angle of [0, 360, 720, -360, 359, 348.75]) assert.equal(compassPoint(angle), "N");
  assert.equal(compassPoint(11.249), "N");
  assert.equal(compassPoint(11.25), "NNE");
  assert.equal(compassPoint(-22.5), "NNW");
  for (const value of [null, undefined, "", "90", NaN, Infinity]) assert.equal(compassPoint(value), "Not available");
});
