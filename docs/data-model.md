# Data contract, v1

## Spot

A stable `id`, display `name`, `waterbody`, `region`, `type` (`lake`, `river`, `sea`, `pool`) and latitude/longitude `coordinates`. `coordinateAccuracy` and `verificationStatus` make editorial uncertainty explicit. `access`, `parking`, `facilities` and `hazards` are editorial fields. Unknown values must remain labelled as unknown.

`source` records the listing source URL, publisher and date the editorial source was checked. This date does not imply field verification or freshness of conditions. `conditionsSource` is an external monitoring source, not an imported reading. Directory links are not site-specific monitoring results.

Each condition contains `status`, `value`, `unit`, `source` and `observedAt`. All are currently unavailable, with null values and timestamps. Future adapters must preserve the provider's observation time and units; distinguish `unavailable`, `fresh`, `stale` and `error`; and expire observations using provider-specific thresholds. Never infer a safe-to-swim status from missing data, weather or a historical reading. Store `fetchedAt` separately from `observedAt`. The UI currently deliberately displays unavailable conditions until a tested adapter and renderer are implemented.

A future provider boundary should return `{ spotId, metric, value, unit, source: { name, url }, observedAt, fetchedAt, status }`. Credentials belong in Cloudflare secrets, not browser code. Add caching, attribution/licence checks, timeouts, unit validation and stale/error behaviour before connecting a provider. No Strava or Garmin dependency is built into the public spot model.

## Route

Routes belong in `routes.json`, separate from spots. Proposed record: `id`, `name`, `spotIds`, `geometry` (GeoJSON LineString in longitude/latitude order), `distanceMetres`, `entrySpotId`, `exitSpotId`, `hazards`, `source`, `verifiedAt` and `verificationStatus`. The current array is empty. No suggested swim path is generated from arbitrary map points.

## Suggestion

The client exports `{ schemaVersion, name, region, type, notes, moderationStatus: 'pending', createdAt }`. This is a local file only, not a public posting. A future backend should validate, rate-limit, store privately and require moderation before adding a public spot. Contact details, if introduced, must be stored separately and not published. Downloading a suggestion is not evidence that a moderator received it.

## Seed provenance

Sources identify locations; coordinates are approximate editorial map positions, not precise monitoring stations or entry points. Queenstown and Roys Bay link to LAWA site pages; other Otago locations are listed in LAWA's embed directory. Mission Bay links to Auckland's tourism listing. Source links are retained per record. No current water-quality ratings, facility claims or routes are fabricated.
