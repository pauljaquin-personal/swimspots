# Data contract, v1

## Spot

A stable `id`, display `name`, `waterbody`, `region`, `type` (`lake`, `river`, `sea`, `pool`) and latitude/longitude `coordinates`. `coordinateAccuracy` and `verificationStatus` make editorial uncertainty explicit. `access`, `parking`, `facilities` and `hazards` are editorial fields. Unknown values must remain labelled as unknown.

`source` records the listing source URL, publisher and date the editorial source was checked. This date does not imply field verification or freshness of conditions. `conditionsSource` is an external monitoring source, not an imported reading. Directory links are not site-specific monitoring results.

Static catalog `conditions` remain unavailable placeholders. Live results are fetched separately from `/api/conditions?spot=<id>`; never update the catalog with transient readings. `lawa` records the matched official widget site ID and URL.

The response contains `weather` and, for sea spots, `marine` provider groups with `status`, `source`, `validAt`, `fetchedAt`, `observedAt: null`, and normalized metric values/units. Current weather is model output, not station observations. Water-quality information stays in the official LAWA report with its sample date and guidance; it is not converted into our own safety classification.

See [feed-integrations.md](feed-integrations.md) for cache/expiry policies, units, licences, API keys and remaining gaps. A future station adapter must use actual observation timestamps and retain station identity and distance from the spot.

## Route

Routes belong in `routes.json`, separate from spots. Proposed record: `id`, `name`, `spotIds`, `geometry` (GeoJSON LineString in longitude/latitude order), `distanceMetres`, `entrySpotId`, `exitSpotId`, `hazards`, `source`, `verifiedAt` and `verificationStatus`. The current array is empty. No suggested swim path is generated from arbitrary map points.

## Suggestion

The client exports `{ schemaVersion, name, region, type, notes, moderationStatus: 'pending', createdAt }`. This is a local file only, not a public posting. A future backend should validate, rate-limit, store privately and require moderation before adding a public spot. Contact details, if introduced, must be stored separately and not published. Downloading a suggestion is not evidence that a moderator received it.

## Seed provenance

Sources identify locations; coordinates are approximate editorial map positions, not precise monitoring stations or entry points. Queenstown and Roys Bay link to LAWA site pages; other Otago locations are listed in LAWA's embed directory. Mission Bay links to Auckland's tourism listing. Source links are retained per record. No current water-quality ratings, facility claims or routes are fabricated.
