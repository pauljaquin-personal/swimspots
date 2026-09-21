# Swimspots NZ

A lightweight swimming-spot explorer for Aotearoa, served as static assets by the existing Cloudflare Worker.

## Run locally

Requires Node.js 20 or newer.

```sh
npm ci
npm run dev
# Open http://127.0.0.1:4173
```

No build step or runtime API keys. Cloudflare continues serving `public/` using the existing `wrangler.jsonc`.

## First milestone

- Leaflet map with OpenStreetMap attribution, linked spot cards and accessible detail dialogs.
- Search ignoring case and macrons, water-type and region filters, empty states and reset.
- Saved spots in local browser storage (no account); optional on-device geolocation with distance sorting.
- Seven editorial starter records, with source links, approximate coordinates and explicit verification status.
- Unavailable water/weather conditions shown honestly; source review dates never presented as observation dates.
- Shareable `#spot=<id>` links and downloadable suggestions awaiting manual review.
- Separate route dataset and documented future provider interface.

**This is an initial collection, not a complete national directory.** Most entries are in Otago, with Mission Bay in Auckland. Pools have no records yet. The map covers New Zealand. No live weather, water-quality or route feeds are connected. Access points, parking, facilities and coordinates need local verification before the listings can be considered complete. Suggestions download locally; there is no submission service or moderation dashboard yet.

## Test

```sh
npm test
npx playwright install chromium
npm run test:e2e
```

The browser suite covers desktop and mobile search/filtering, saved persistence, spot deep links, suggestion downloads, location success/denial, data failure and map-tile failure. An optional `PLAYWRIGHT_EXECUTABLE_PATH` can select a local browser.

## Data & providers

See [docs/data-model.md](docs/data-model.md). Edit `public/data/spots.json` for listings; do not put private contact information in public data. `public/data/routes.json` is deliberately empty until routes have been verified.

Map tiles are requested directly from OpenStreetMap; location coordinates used for sorting are not sent to our server or stored. Tile requests do reveal the map area to the tile provider. Review the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/) and choose an appropriate provider as traffic grows. Leaflet 1.9.4 is vendored locally with its license so the library does not require a CDN at runtime. `npm` is only needed for development/tests; refresh the vendored assets deliberately when upgrading Leaflet.

## Next milestones

1. Verify spot coordinates, entry points, facilities and local hazards; expand regions.
2. Agree licensed/approved water-quality and weather feeds, freshness thresholds and attribution.
3. Add a server-side submission/moderation flow before accepting public submissions.
4. Publish verified routes independently of locations, with geometry and provenance.
5. Evaluate Strava/Garmin integrations only after permission, privacy and product requirements are defined.
