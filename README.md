# Swimspots NZ

A lightweight swimming-spot explorer for Aotearoa, served as static assets by the existing Cloudflare Worker.

## Run locally

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
# Open http://127.0.0.1:4173
```

Static files are served from `public/`; a small Cloudflare Worker handles `/api/conditions`. Run `npm run build:check` to validate the deployment bundle. Open-Meteo needs no key for this non-commercial prototype; commercial use requires a server-side key. See [feed integration notes](docs/feed-integrations.md), including the MetService API review.

## First milestone

- Leaflet map with OpenStreetMap attribution, linked spot cards and accessible detail dialogs.
- Search ignoring case and macrons, water-type and region filters, empty states and reset.
- Saved spots in local browser storage (no account); optional on-device geolocation with distance sorting.
- Seven editorial starter records, with source links, approximate coordinates and explicit verification status.
- Weather and coastal model feeds with source/time labels, bounded caching and outage handling; official LAWA reports for water quality.
- Shareable `#spot=<id>` links, saved submission drafts, a persisted review queue and approved community locations.
- Separate route dataset and documented future provider interface.

**This is an initial collection, not a complete national directory.** Most entries are in Otago, with Mission Bay in Auckland. Pools have no records yet. The map covers New Zealand. Weather/marine forecasts and LAWA reports are connected. Freshwater temperature/level/flow, local tides/currents and verified routes are not. Access points, parking, facilities and coordinates need local verification before the listings can be considered complete. Submissions and the reviewer dashboard work in the local preview. Public submissions require the D1 database and reviewer secret described in [submission setup](docs/submissions.md).

## Test

```sh
npm test
npx playwright install chromium
npm run test:e2e
```

The browser suite covers desktop and mobile search/filtering, saved persistence, spot deep links, submission/approval and draft recovery, location success/denial, data failure and map-tile failure. An optional `PLAYWRIGHT_EXECUTABLE_PATH` can select a local browser.

## Data & providers

See [docs/data-model.md](docs/data-model.md). Edit `public/data/spots.json` for listings; do not put private contact information in public data. `public/data/routes.json` is deliberately empty until routes have been verified.

Map tiles are requested directly from OpenStreetMap; location coordinates used for sorting are not sent to our server or stored. Tile requests do reveal the map area to the tile provider. Review the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/) and choose an appropriate provider as traffic grows. Leaflet 1.9.4 is vendored locally with its license so the library does not require a CDN at runtime. `npm` is only needed for development/tests; refresh the vendored assets deliberately when upgrading Leaflet.

## Next milestones

See the [reconciled roadmap](docs/roadmap.md). Next: curate real entry points, arrange supported ORC data access, configure production submissions, and release the reviewed build. Swim routes come after this, with Strava/Garmin integration later.

[Community submission setup and limits](docs/submissions.md) · [Council source findings](docs/roadmap.md#council-source-decision)
