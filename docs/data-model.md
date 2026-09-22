# Data contract, v1

## Spot

A stable `id`, display `name`, `waterbody`, `region`, `type` (`lake`, `river`, `sea`, `pool`) and latitude/longitude `coordinates`. `coordinateAccuracy` and `verificationStatus` make editorial uncertainty explicit. `access`, `parking`, `facilities` and `hazards` are editorial fields. Unknown values must remain labelled as unknown.

`source` records the listing source URL, publisher and date the editorial source was checked. This date does not imply field verification or freshness of conditions. `conditionsSource` is an external monitoring source, not an imported reading. Directory links are not site-specific monitoring results.

A spot may include one optional primary `photo` object with `url`, descriptive `alt` text and an optional `credit`. The current UI uses that image in the result card and detail banner, and falls back to the existing generated water artwork when no photo is present or the image fails to load. Photo files should be locally controlled or otherwise have clear publication rights; do not hotlink arbitrary third-party images. Example: `"photo": { "url": "/images/spots/queenstown-bay.jpg", "alt": "Queenstown Bay looking across Lake Whakatipu", "credit": "Photographer name" }`.

Static catalog `conditions` remain unavailable placeholders. Live results are fetched separately from `/api/conditions?spot=<id>`; never update the catalog with transient readings. `lawa` records the matched official widget site ID and URL.

The response contains `weather` and, for sea spots, `marine` provider groups with `status`, `source`, `validAt`, `fetchedAt`, `observedAt: null`, and normalized metric values/units. Current weather is model output, not station observations. Water-quality information stays in the official LAWA report with its sample date and guidance; it is not converted into our own safety classification.

See [feed-integrations.md](feed-integrations.md) for cache/expiry policies, units, licences, API keys and remaining gaps. A future station adapter must use actual observation timestamps and retain station identity and distance from the spot.

## Route

Routes belong in `routes.json`, separate from spots. Proposed record: `id`, `name`, `spotIds`, `geometry` (GeoJSON LineString in longitude/latitude order), `distanceMetres`, `entrySpotId`, `exitSpotId`, `hazards`, `source`, `verifiedAt` and `verificationStatus`. The current array is empty. No suggested swim path is generated from arbitrary map points.

## Suggestion

Submissions are validated server-side and stored separately with a UUID, location fields, creation time and pending/approved/rejected status. Reviewer notes and timestamps remain private. Only approved records are projected into public spot objects; submitted feed identifiers and privileged fields are discarded. See [submission storage and deployment](submissions.md). Browser drafts are optional localStorage state; receipt is confirmed only after durable server storage.
