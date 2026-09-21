# Swimspots roadmap

Reconciled 21 September 2026 with the earlier **Review Swim Spots Architecture** conversation. Keep the lightweight Cloudflare application; build useful public information before accounts, payments or activity-service integrations.

1. **Map and spot model — implemented in draft PR.** Search, categories, near me, saved spots, access/hazards, provenance, mobile layout.
2. **Conditions — working prototype.** Modelled weather and regional marine data; LAWA reports. ORC dashboards and Mission Bay Safeswim report linked. Direct council readings need a supported current feed and verified station/depth mappings.
3. **Community locations — implemented locally, deployment configuration outstanding.** Persisted submissions, draft recovery, duplicate checks, private review queue, editable review and approve/reject workflow. Approved spots join the map and get weather forecasts. No automatic council station assignment.
4. **Curate and release.** Add and review real local entry points; verify access, facilities and hazards. Configure production D1 and reviewer credentials, complete deployment checks, then merge/deploy when requested.
5. **Swim routes.** Routes are distinct from locations: geometry, distance, entry/exit points, hazards and provenance. Establish editorial verification before accepting community routes.
6. **Later integrations.** Strava/Garmin adapters, accounts and possible payments only when product needs justify them. Do not publish private activity tracks by default.

## Council source decision

ORC's current [lake buoy dashboard](https://envdata.orc.govt.nz/AQWebPortal/Data/Dashboard/1676) covers Whakatipu, Wānaka, Hāwea and Hayes. The [levels/flows](https://envdata.orc.govt.nz/AQWebPortal/Data/Dashboard/213) and [rainfall](https://envdata.orc.govt.nz/AQWebPortal/Data/Dashboard/234) dashboards are linked from ORC's [water data page](https://www.orc.govt.nz/environment/water-care/water-data).

The publicly reachable legacy Hilltop Global service was inspected. Relevant Taieri at Outram records end in 2021; some lake records are older. ORC's [migration notice](https://www.orc.govt.nz/your-council/latest-news/regulatory-newsletter/2022-05-regulatory-newsletter/) says Hilltop is being decommissioned and directs data users to hydrodatarequests@orc.govt.nz. Do not use this legacy service as a live feed. The current portal requires acceptance of its disclaimer/copyright conditions. We have not accepted these on the owner's behalf or created a portal account, and have not verified a supported anonymous API.

Next direct-feed step: obtain ORC's supported Aquarius/API access and public-display/reuse terms. Ask for station IDs, coordinates, waterbody, sensor depth, units, timezone (portal uses NZST), quality flags, cadence, attribution and rate limits. Map lake buoys as regional/depth-specific observations, never as beach-surface temperature. Confirm the current Outram flow station separately. No request has been emailed.

Mission Bay links to its [official Safeswim location](https://safeswim.org.nz/locations/mission-bay-beach). No numerical values or safety classifications were scraped or cached. The council/report links are deliberately labelled as external reports, not imported live feeds.
