import { compassPoint } from "./model.js";

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
    : "—";

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

function metricCard(glyph, label, value, tone = "") {
  const c = el("div", null, `condition condition-compact ${tone}`.trim());
  const icon = el("span", glyph, "condition-icon");
  icon.setAttribute("aria-hidden", "true");
  const copy = el("span", null, "condition-copy");
  copy.append(el("span", label), el("strong", value));
  c.append(icon, copy);
  return c;
}

function detailsBlock(label, glyph) {
  const details = el("details", null, "condition-details");
  const summary = el("summary");
  const icon = el("span", glyph, "condition-summary-icon");
  icon.setAttribute("aria-hidden", "true");
  summary.append(icon, el("span", label), el("span", "›", "condition-chevron"));
  details.append(summary);
  return details;
}

function weatherView(feed, waterTemperature = null, detailsTarget = null) {
  const section = el("section", null, "feed-section compact-feed");
  section.append(el("h3", "Weather"));
  if (!feed || feed.status === "unavailable") {
    section.append(
      el("p", "Weather temporarily unavailable.", "feed-error"),
    );
    return section;
  }

  const current = el("div", null, "conditions condition-strip");
  current.append(
    metricCard(
      "≈",
      "Water temp",
      waterTemperature ? number(waterTemperature) : "N/A",
      "condition-water-temp",
    ),
    metricCard("°", "Air", number(feed.current.airTemperature)),
    metricCard("→", "Wind", number(feed.current.windSpeed)),
    metricCard("↝", "Gusts", number(feed.current.windGusts)),
    metricCard("⌁", "From", compassPoint(feed.current.windDirection?.value)),
    metricCard(
      "◌",
      "Rain 48h",
      number(feed.rain48h),
      feed.rain48h?.value > 0 ? "condition-attention" : "",
    ),
  );
  section.append(current);

  if (feed.rain48h?.value > 0) {
    section.append(
      el(
        "p",
        `Rain in the past 48 hours${feed.rain48h.lastPrecipitationAt ? ` · last around ${date(feed.rain48h.lastPrecipitationAt)}` : ""}. Check water-quality advice.`,
        "feed-rain-alert compact-alert",
      ),
    );
  }

  const more = detailsBlock("Weather details & forecast", "☼");
  more.append(
    el(
      "p",
      stale(feed)
        ? "Older model data — refresh needed."
        : "Model estimate, not a station observation.",
      stale(feed) ? "feed-error" : "feed-label",
    ),
    el(
      "p",
      `Model time: ${date(feed.validAt)} · Fetched: ${date(feed.fetchedAt)}`,
      "feed-time",
    ),
  );

  if (feed.rain48h?.value !== null) {
    more.append(
      el(
        "p",
        `Precipitation period: ${date(feed.rain48h.from)} – ${date(feed.rain48h.to)}. Modelled precipitation, not a rain-gauge measurement.`,
        "feed-time",
      ),
    );
  }

  if (feed.message) more.append(el("p", feed.message, "feed-error"));

  const future = (feed.forecast || [])
    .filter((r) => Date.parse(r.validAt) > Date.now())
    .slice(0, 12);
  if (future.length) {
    const wrap = el("div", null, "forecast-scroll");
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", "Hourly forecast table");
    const table = el("table", null, "forecast-table");
    const head = el("thead");
    const headRow = el("tr");
    ["Time", "Air", "Wind", "Gusts", "Rain"].forEach((t) => {
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
    more.append(wrap);
  }

  const credit = el("p", null, "feed-credit");
  credit.append(
    external(feed.source.name, feed.source.url),
    document.createTextNode(
      ` · ${feed.source.licence}. Values rounded; rainfall total calculated from hourly model data.`,
    ),
  );
  more.append(credit);
  if (detailsTarget) {
    more.classList.add("weather-details-full");
    detailsTarget.replaceChildren(more);
  } else {
    section.append(more);
  }
  return section;
}

function marineView(feed) {
  const section = el("section", null, "feed-section compact-feed");
  section.append(el("h3", "Sea conditions"));
  if (!feed || feed.status === "unavailable") {
    section.append(
      el("p", "Marine forecast temporarily unavailable.", "feed-error"),
    );
    return section;
  }

  const cards = el("div", null, "conditions condition-strip");
  cards.append(
    metricCard("⌇", "Wave", number(feed.current.waveHeight, 2)),
    metricCard("↔", "Period", number(feed.current.wavePeriod)),
  );
  section.append(cards);

  const more = detailsBlock("About sea conditions", "≈");
  more.append(
    el(
      "p",
      "Regional ocean values can differ inside bays and at the shoreline. Wave height is not a breaking-surf or rip-current prediction.",
      "small",
    ),
    el(
      "p",
      `Model time: ${date(feed.validAt)} · Fetched: ${date(feed.fetchedAt)}`,
      "feed-time",
    ),
  );
  if (feed.grid)
    more.append(
      el(
        "p",
        `Model grid: ${feed.grid.latitude.toFixed(3)}, ${feed.grid.longitude.toFixed(3)}.`,
        "feed-time",
      ),
    );
  const attribution = el("p", null, "feed-credit");
  attribution.append(
    external(feed.source.name, feed.source.url),
    document.createTextNode(` · ${feed.source.licence}. Values rounded.`),
  );
  more.append(attribution);
  section.append(more);
  return section;
}

function waterQualityView(spot) {
  const section = el("section", null, "feed-section compact-feed water-quality-card");
  const heading = el("h3", "Water quality · LAWA");
  section.append(heading);

  const action = el("div", null, "quality-action");
  const icon = el("span", "●", "quality-icon");
  icon.setAttribute("aria-hidden", "true");
  const copy = el("div");
  copy.append(
    el("strong", "Check current water quality"),
    el("span", "Official LAWA report"),
  );
  const href = spot.lawa?.embedUrl || spot.conditionsSource.url;
  const button = external("Open ↗", href);
  button.className = "outline compact-link";
  action.append(icon, copy, button);
  section.append(action);

  return section;
}

function waterQualityInfoView(spot) {
  const section = el("section", null, "listing-info-section");
  section.append(el("h3", "Water quality source"));
  section.append(
    el(
      "p",
      "Samples and warnings are not continuous readings. Check the report date and current local signs before swimming.",
      "small",
    ),
  );
  if (spot.lawa) {
    const report = el("details", null, "lawa-report");
    report.append(el("summary", "Show embedded LAWA report"));
    const wrap = el("div", null, "lawa-scroll");
    report.append(wrap);
    report.addEventListener("toggle", () => {
      if (report.open && !wrap.children.length) {
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
    section.append(report);
  }
  section.append(
    el(
      "p",
      "LAWA supplies and dates the report; Swimspots does not assign a safety rating.",
      "feed-time",
    ),
  );
  return section;
}

export function mountConditions(container, spot, listingDetails = null) {
  let controller = null,
    closed = false,
    payload = null,
    loading = false;

  const grid = el("div", null, "conditions-layout");
  const left = el("div", null, "conditions-column conditions-column-weather");
  const right = el("div", null, "conditions-column conditions-column-water");
  const feeds = el("div");
  const weatherDetailsSlot = el("div", null, "weather-details-slot");
  const status = el("p", "Loading conditions…", "small condition-load-status");
  status.setAttribute("role", "status");
  const retry = el("button", "↻ Refresh", "outline feed-refresh compact-refresh");

  left.append(feeds, status, retry);
  right.append(waterQualityView(spot));
  grid.append(left, right, weatherDetailsSlot);
  container.append(grid);

  if (listingDetails) listingDetails.append(waterQualityInfoView(spot));

  if (spot.council) {
    const council = detailsBlock(spot.council.name, "i");
    council.classList.add("council-links");
    council.append(el("p", spot.council.note, "small"));
    for (const source of spot.council.links)
      council.append(external(source.name + " ↗", source.url));
    (listingDetails || right).append(council);
  }

  function render() {
    if (!payload) return;
    const waterTemperature =
      spot.type === "sea" && payload.marine?.current?.seaTemperature
        ? payload.marine.current.seaTemperature
        : null;
    feeds.replaceChildren(weatherView(payload.weather, waterTemperature, weatherDetailsSlot));
    if (listingDetails) {
      listingDetails.querySelector(".listing-sea-conditions")?.remove();
      if (spot.type === "sea") {
        const marine = marineView(payload.marine);
        marine.classList.add("listing-sea-conditions");
        listingDetails.append(marine);
      }
    }
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
          ? "Some conditions unavailable."
          : "Updated";
    } catch {
      if (!closed) {
        if (payload) {
          for (const key of ["weather", "marine"])
            if (payload[key]?.current) payload[key].status = "stale";
          render();
        }
        status.textContent = "Conditions unavailable · retry";
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
