const el = (tag, text, className) => {
  const n = document.createElement(tag);
  if (text != null) n.textContent = text;
  if (className) n.className = className;
  return n;
};
const external = (label, url) => {
  const a = el("a", label);
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
};
const number = (metric, digits = 1) =>
  typeof metric?.value === "number" && Number.isFinite(metric.value)
    ? `${metric.value.toFixed(digits)} ${metric.unit}`
    : "Not available";
const date = (value) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed)
    ? new Intl.DateTimeFormat("en-NZ", {
        timeZone: "Pacific/Auckland",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(parsed)
    : "Unavailable";
};
function stale(feed) {
  return (
    feed.status === "stale" ||
    Date.now() - Date.parse(feed.fetchedAt) > 60 * 60_000 ||
    Date.now() - Date.parse(feed.validAt) > 3 * 3600_000
  );
}
function card(label, value) {
  const c = el("div", null, "condition");
  c.append(el("span", label), el("strong", value));
  return c;
}
function credit(feed) {
  const p = el("p", null, "feed-credit");
  p.append(
    external(feed.source.name, feed.source.url),
    document.createTextNode(
      ` · ${feed.source.licence}. Values rounded; rainfall total calculated from hourly model data.`,
    ),
  );
  return p;
}
function weatherView(feed) {
  const section = el("section", null, "feed-section");
  section.append(el("h3", "Weather at this spot"));
  if (!feed || feed.status === "unavailable") {
    section.append(
      el(
        "p",
        "Weather is temporarily unavailable. Try again shortly.",
        "feed-error",
      ),
    );
    return section;
  }
  section.append(
    el(
      "p",
      stale(feed)
        ? "Older model data — refresh needed"
        : "Model estimate · not a station observation",
      stale(feed) ? "feed-error" : "feed-label",
    ),
  );
  const current = el("div", null, "conditions");
  current.append(
    card("Air temperature", number(feed.current.airTemperature)),
    card("Wind at 10 m", number(feed.current.windSpeed)),
    card("Wind gusts", number(feed.current.windGusts)),
    card("Wind from", number(feed.current.windDirection, 0)),
    card("Past 24h precipitation · modelled", number(feed.rain24h)),
  );
  section.append(
    current,
    el(
      "p",
      `Model time: ${date(feed.validAt)} · Fetched: ${date(feed.fetchedAt)}`,
      "feed-time",
    ),
  );
  if (feed.rain24h?.value !== null)
    section.append(
      el(
        "p",
        `Precipitation period: ${date(feed.rain24h.from)} – ${date(feed.rain24h.to)}. This is modelled rain/snow, not a rain-gauge measurement.`,
        "feed-time",
      ),
    );
  if (feed.message) section.append(el("p", feed.message, "feed-error"));
  const future = (feed.forecast || [])
    .filter((r) => Date.parse(r.validAt) > Date.now())
    .slice(0, 12);
  if (future.length) {
    const forecastDetails = el("details", null, "forecast-details");
    forecastDetails.append(el("summary", "Next 12 hours · forecast"));
    const wrap = el("div", null, "forecast-scroll");
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", "Hourly forecast table");
    const table = el("table", null, "forecast-table");
    const head = el("thead"),
      headRow = el("tr");
    ["Time (NZ)", "Air", "Wind", "Gusts", "Precipitation"].forEach((t) => {
      const th = el("th", t);
      th.scope = "col";
      headRow.append(th);
    });
    head.append(headRow);
    const body = el("tbody");
    future.forEach((r) => {
      const row = el("tr");
      [
        date(r.validAt),
        number(r.airTemperature),
        number(r.windSpeed),
        number(r.windGusts),
        number(r.precipitation),
      ].forEach((v) => row.append(el("td", v)));
      body.append(row);
    });
    table.append(head, body);
    wrap.append(table);
    forecastDetails.append(wrap);
    section.append(forecastDetails);
  }
  section.append(credit(feed));
  return section;
}
function marineView(feed) {
  const section = el("section", null, "feed-section");
  section.append(el("h3", "Regional sea conditions"));
  if (!feed || feed.status === "unavailable") {
    section.append(
      el("p", "Marine forecasts are temporarily unavailable.", "feed-error"),
    );
    return section;
  }
  section.append(
    el(
      "p",
      stale(feed)
        ? "Older marine model data — refresh needed"
        : "Offshore model estimate",
      stale(feed) ? "feed-error" : "feed-label",
    ),
  );
  const cards = el("div", null, "conditions");
  cards.append(
    card("Sea surface temperature", number(feed.current.seaTemperature)),
    card("Significant wave height", number(feed.current.waveHeight, 2)),
    card("Wave period", number(feed.current.wavePeriod)),
  );
  section.append(
    cards,
    el(
      "p",
      "Regional ocean values may differ substantially inside a bay or at the shoreline. Wave height is not a prediction of breaking surf; these values do not describe local rip currents.",
      "small",
    ),
  );
  section.append(
    el(
      "p",
      `Model time: ${date(feed.validAt)} · Fetched: ${date(feed.fetchedAt)}`,
      "feed-time",
    ),
  );
  if (feed.grid)
    section.append(
      el(
        "p",
        `Model grid: ${feed.grid.latitude.toFixed(3)}, ${feed.grid.longitude.toFixed(3)}. This is not a sensor at this beach.`,
        "feed-time",
      ),
    );
  const attribution = el("p", null, "feed-credit");
  attribution.append(
    external(feed.source.name, feed.source.url),
    document.createTextNode(` · ${feed.source.licence}. Values rounded.`),
  );
  section.append(attribution);
  return section;
}
export function mountConditions(container, spot) {
  let controller = null,
    closed = false,
    payload = null,
    loading = false;
  const feeds = el("div");
  const status = el("p", "Loading weather…", "small");
  status.setAttribute("role", "status");
  const retry = el("button", "Refresh conditions", "outline feed-refresh");
  container.append(feeds, status, retry);
  const water = el("section", null, "feed-section");
  water.append(el("h3", "Water quality · LAWA"));
  water.append(
    el(
      "p",
      "Open the official report for the latest available sample, warnings and seasonal guidance. Samples are not continuous readings; check the dates in the report.",
      "small",
    ),
  );
  if (spot.lawa) {
    const details = el("details", null, "lawa-report");
    details.append(el("summary", "Show official water-quality report"));
    const wrap = el("div", null, "lawa-scroll");
    details.append(wrap);
    details.addEventListener("toggle", () => {
      if (details.open && !wrap.children.length) {
        const iframe = el("iframe");
        iframe.title = `LAWA water quality for ${spot.name}`;
        iframe.src = spot.lawa.embedUrl;
        iframe.loading = "lazy";
        iframe.referrerPolicy = "strict-origin-when-cross-origin";
        iframe.height = "550";
        iframe.width = "500";
        wrap.append(iframe);
      }
    });
    water.append(
      details,
      external("Open the LAWA report in a new tab ↗", spot.lawa.embedUrl),
      el(
        "p",
        "If the report is blank or unavailable, use the link above. LAWA supplies and dates this report; Swimspots does not assign a safety rating.",
        "feed-time",
      ),
    );
  } else
    water.append(
      external(
        "Find water-quality information on LAWA ↗",
        spot.conditionsSource.url,
      ),
    );
  container.append(water);
  if (spot.type !== "sea")
    container.append(
      el(
        "p",
        "Lake/river water temperature, level and flow are not connected. Air temperature is not water temperature.",
        "small",
      ),
    );
  else
    container.append(
      el(
        "p",
        "Local tide predictions and currents are not connected.",
        "small",
      ),
    );
  function render() {
    if (!payload) return;
    feeds.replaceChildren(weatherView(payload.weather));
    if (spot.type === "sea") feeds.append(marineView(payload.marine));
  }
  async function refresh() {
    if (loading || closed) return;
    loading = true;
    retry.disabled = true;
    status.textContent = "Loading conditions…";
    controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(
        `/api/conditions?spot=${encodeURIComponent(spot.id)}`,
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error("Unavailable");
      const data = await response.json();
      if (data.spotId !== spot.id || !data.weather)
        throw new Error("Invalid response");
      if (closed) return;
      payload = data;
      render();
      status.textContent =
        data.weather.status === "unavailable"
          ? "Some conditions could not load. You can retry or open the official water-quality report."
          : "Forecasts loaded. Times are shown in New Zealand local time.";
    } catch {
      if (!closed) {
        if (payload) {
          for (const key of ["weather", "marine"])
            if (payload[key]?.current) payload[key].status = "stale";
          render();
        }
        status.textContent =
          "Conditions could not refresh. Try again; the LAWA report is available separately.";
      }
    } finally {
      clearTimeout(timer);
      loading = false;
      if (!closed) retry.disabled = false;
    }
  }
  retry.onclick = refresh;
  refresh();
  const tick = setInterval(() => {
    if (payload && !closed) render();
  }, 60_000);
  return () => {
    closed = true;
    controller?.abort();
    clearInterval(tick);
  };
}
