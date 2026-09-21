# Feed integration notes

Reviewed 21 September 2026.

## Implemented

- Open-Meteo forecast: current model air temperature, wind/gust/direction, the preceding 24 complete hours of modelled precipitation, and hourly forecasts. The UI shows the next 12 hours.
- Open-Meteo Marine: sea-surface temperature, significant wave height and wave period for sea spots only. These are regional ocean model values, not local beach or lake measurements. No tides/currents are inferred.
- LAWA's official water-quality plugin, matched to all seven starter listings. Reports load on demand inside an iframe and have a permanent direct link if embedding fails. LAWA owns the displayed sample dates, warnings and interpretation; we do not scrape or transform their safety assessments.

Sources: [weather API](https://open-meteo.com/en/docs), [marine API](https://open-meteo.com/en/docs/marine-weather-api), [LAWA website plugin](https://embed.lawa.org.nz/setup).

## Operation

`GET /api/conditions?spot=<catalog-id>` runs in a Cloudflare Worker, alongside static assets. The API accepts only catalog IDs, never arbitrary coordinates or upstream URLs. Requests to `/api/*` run through the Worker; static files retain asset serving. The local Node server exercises the same handler and adapters.

Each provider is fetched independently, with an eight-second abort timeout. Normalized results are cached per spot at the Cloudflare edge for 15 minutes. A failed refresh can retain data up to one hour from its original fetch, explicitly marked stale; that timestamp is not reset. Older data is discarded. Concurrent requests in one isolate share an in-flight fetch. Cache storage is best-effort and is per Cloudflare data centre, not a global request quota. Public API abuse controls should be reviewed as traffic grows.

Unix timestamps are interpreted as UTC, then displayed in Pacific/Auckland, including daylight saving. `validAt` means the model's valid time, `fetchedAt` means retrieval time, and `observedAt` stays null. The provider does not supply an issue time in this response. Data over three hours from its valid time is labelled old. Zero values stay zero; invalid values/units and incomplete precipitation windows are unavailable. Precipitation is summed only for 24 contiguous completed hours, not forecast hours. Forecast/table values are rounded with attribution. No safe-to-swim score is calculated.

## Licensing and configuration

[Open-Meteo's free API](https://open-meteo.com/en/pricing) is for evaluation/non-commercial use. Before monetising this site, arrange a commercial subscription and set `OPEN_METEO_API_KEY` as a Cloudflare Worker secret. The adapter then selects the customer endpoints. Do not put keys in `public/`, source control or browser code. Local development can use the environment variable. Data attribution and modification notes appear next to each feed.

The present prototype incurs no new subscription. Deploying the Worker uses the account's existing Cloudflare limits. Production deployment remains a separate merge/deploy step.

## MetService review

MetService does offer documented public developer APIs; they require registration and product-specific access credentials. No MetService account or subscription has been created by this change.

| Product                                                                      | Relevance to Swimspots                                                               | Advertised access                                                                                                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [Point Forecast](https://data.metservice.com/product/point-forecast-api)     | Atmospheric and ocean forecasts by coordinate, including wind, temperature and waves | Free Starter for prototyping; Basic US$30/month for commercial production; Plus US$75/month lists high-resolution NZ 4 km atmospheric models |
| [Weather Stations](https://data.metservice.com/product/weather-stations-api) | Actual station observations, which would complement model forecasts                  | Developer early access; free non-commercial tier lists three-hourly resolution; commercial one-minute access requires a tailored quote       |

The Point Forecast API uses an `x-api-key` header. API units depend on variables and points; derived variables can consume underlying inputs. Paid plans can incur overage charges. Verify the chosen plan and entitlements in the account before enabling it.

The [API terms](https://data.metservice.com/terms-service) require approved application use and prominent attribution. Confirm public display, storage, transformations and redistribution rights for Swimspots in the access agreement. Their attribution rule differs from Open-Meteo, so a future adapter needs its own presentation policy. Do not scrape the consumer website or assume the same terms as Open-Meteo. MetService's [support guide](https://developer.metservice.com/docs/support/) also explains that API model output can differ from the curated consumer forecast.

Recommendation: retain these working prototype feeds while evaluating a MetService key and NZ forecast coverage. Trial the Point Forecast API at our lake/beach coordinates before committing to a paid plan. Keep station observations labelled with the actual station and distance, not as measurements at the swim entry point. The provider adapter boundary in `src/feeds.js` allows replacement without changing the spot catalog or map.

## Not connected

Freshwater temperatures, lake levels, river flows, local tide predictions and local currents still need verified station mappings and usable feeds. MetService integration needs a key/access agreement and a tested adapter; adding a key alone will not activate it. Community moderation is implemented locally; production configuration and verified routes remain separate milestones. Official ORC dashboard and Mission Bay Safeswim links are attached to catalog records. Direct council readings are still unconnected; see [the council source review](roadmap.md#council-source-decision).
