import { mountSubmission } from "./submit.js";
import { mountConditions } from "./conditions.js";
import { selectSpots, distanceKm } from "./model.js";
const $ = (s) => document.querySelector(s);
const state = {
  query: "",
  type: "all",
  region: "all",
  savedOnly: false,
  saved: [],
  location: null,
};
let spots = [],
  map,
  markers,
  userMarker;
let disposeConditions = () => {};
try {
  const saved = JSON.parse(localStorage.getItem("swimspots:saved") || "[]");
  state.saved = Array.isArray(saved)
    ? saved.filter((x) => typeof x === "string")
    : [];
} catch {
  /* Storage is optional. */
}
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function link(text, href) {
  const a = el("a", text);
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}
function spotGlyph(type) {
  return { lake: "◉", river: "↝", sea: "≈", pool: "▣" }[type] || "●";
}
function icon(label, glyph) {
  const span = el("span", glyph, "ui-icon");
  span.setAttribute("aria-hidden", "true");
  const wrap = el("span", null, "icon-label");
  wrap.append(span, el("span", label));
  return wrap;
}
function infoDisclosure(label, glyph, value, className = "") {
  const details = el("details", null, `info-disclosure ${className}`.trim());
  const summary = el("summary");
  summary.append(icon(label, glyph), el("span", "›", "disclosure-chevron"));
  details.append(summary, el("p", value || "Not yet verified.", "disclosure-copy"));
  return details;
}
function infoFact(label, glyph, value, className = "") {
  const row = el("div", null, `spot-fact ${className}`.trim());
  const symbol = el("span", glyph, "ui-icon");
  symbol.setAttribute("aria-hidden", "true");
  const copy = el("div", null, "spot-fact-copy");
  copy.append(el("strong", label), el("p", value || "Not yet verified."));
  row.append(symbol, copy);
  return row;
}
function cardArtwork(s) {
  const art = el("span", spotGlyph(s.type), `spot-art ${s.type}`);
  art.setAttribute("aria-hidden", "true");
  if (s.photo?.url) {
    const img = document.createElement("img");
    img.src = s.photo.url;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.onerror = () => img.remove();
    art.append(img);
  }
  return art;
}
function detailArtwork(s) {
  const banner = el("div", null, "detail-banner");
  if (!s.photo?.url) return banner;
  const img = document.createElement("img");
  img.src = s.photo.url;
  img.alt = s.photo.alt || `${s.name} swimming spot`;
  img.decoding = "async";
  img.onerror = () => {
    img.remove();
    banner.querySelector(".photo-credit")?.remove();
  };
  banner.append(img);
  if (s.photo.credit) {
    const credit = el("span", "Photo: ", "photo-credit");
    if (s.photo.sourceUrl) {
      credit.append(link(s.photo.credit, s.photo.sourceUrl));
    } else {
      credit.append(document.createTextNode(s.photo.credit));
    }
    if (s.photo.license) {
      credit.append(document.createTextNode(" · "));
      if (s.photo.licenseUrl) {
        credit.append(link(s.photo.license, s.photo.licenseUrl));
      } else {
        credit.append(document.createTextNode(s.photo.license));
      }
    }
    banner.append(credit);
  }
  return banner;
}
function save(id) {
  state.saved = state.saved.includes(id)
    ? state.saved.filter((s) => s !== id)
    : [...state.saved, id];
  try {
    localStorage.setItem("swimspots:saved", JSON.stringify(state.saved));
  } catch {
    $("#location-status").textContent =
      "Saved for this visit only; browser storage is unavailable.";
  }
  render();
}
function fit() {
  const visible = selectSpots(spots, state);
  if (map && visible.length)
    map.fitBounds(
      visible.map((s) => s.coordinates),
      { padding: [55, 55], maxZoom: 12, animate: false },
    );
}
function render() {
  const visible = selectSpots(spots, state);
  $("#results").replaceChildren();
  $("#result-count").textContent =
    `${visible.length} ${state.savedOnly ? "saved " : ""}spot${visible.length === 1 ? "" : "s"}${state.location ? " · nearest first" : " to explore"}`;
  $("#saved-count").textContent = spots.filter((s) =>
    state.saved.includes(s.id),
  ).length;
  $("#saved").setAttribute("aria-pressed", String(state.savedOnly));
  $("#saved").classList.toggle("is-active", state.savedOnly);
  markers?.clearLayers();
  if (!visible.length) {
    const empty = el("div", null, "empty");
    empty.append(
      el(
        "strong",
        state.savedOnly
          ? "Your next favourite is out there."
          : "No spots found just yet.",
      ),
      el(
        "p",
        state.savedOnly
          ? "Save a spot with the star, or reset your filters."
          : "Try another place or reset your filters. Our starter collection is still growing.",
      ),
    );
    $("#results").append(empty);
  }
  visible.forEach((s) => {
    const card = el("article", null, "spot-card");
    const open = el("button", null, "card-open");
    open.setAttribute("aria-label", `View ${s.name}`);
    const art = cardArtwork(s);
    const copy = el("span", null, "card-copy");
    copy.append(
      el("span", `${spotGlyph(s.type)} ${s.type}`, "type-label"),
      el("strong", s.name),
      el(
        "small",
        state.location
          ? `${distanceKm(state.location, s.coordinates).toFixed(1)} km · straight line`
          : s.waterbody,
      ),
    );
    open.append(art, copy);
    open.onclick = () => showSpot(s);
    const star = el("button", state.saved.includes(s.id) ? "★" : "☆", "save");
    star.setAttribute(
      "aria-label",
      `${state.saved.includes(s.id) ? "Unsave" : "Save"} ${s.name}`,
    );
    star.setAttribute("aria-pressed", String(state.saved.includes(s.id)));
    star.onclick = () => save(s.id);
    card.append(open, star);
    $("#results").append(card);
    if (map) {
      const marker = L.marker(s.coordinates, {
        title: s.name,
        alt: s.name,
        icon: L.divIcon({
          className: `pin ${s.type}`,
          html: "≋",
          iconSize: [31, 31],
          iconAnchor: [15, 15],
        }),
      })
        .addTo(markers)
        .bindTooltip(el("span", s.name))
        .on("click", () => showSpot(s));
      marker.getElement().setAttribute("aria-label", `View ${s.name} on map`);
    }
  });
}
function showSpot(s) {
  disposeConditions();
  const content = $("#spot-content");
  content.replaceChildren();
  const meta = el("div", null, "detail-meta");
  meta.append(
    el("span", s.type.toUpperCase(), "badge"),
    el("span", s.region, "badge"),
    el(
      "span",
      s.listingStatus === "community-reviewed"
        ? "Community location · reviewed"
        : "Starter listing · verification pending",
      "badge",
    ),
  );
  const title = el("h2", s.name);
  title.id = "spot-title";

  const summary = el("section", null, "spot-summary-grid");
  summary.setAttribute("aria-label", "About this swim spot");

  const description = el("div", null, "spot-description");
  description.append(
    el("h3", "About"),
    el("p", s.description || "Local description coming soon."),
  );

  const facts = el("div", null, "spot-facts");
  facts.setAttribute("aria-label", "Access and practical information");
  facts.append(
    infoFact("Access", "↗", s.access),
    infoFact("Parking", "P", s.parking),
    infoFact("Facilities", "⌂", s.facilities),
    infoFact("Hazards", "!", s.hazards, "hazard"),
    infoFact(
      "Location",
      "⌖",
      `${s.coordinates.join(", ")} · approximate, not a verified water-entry point`,
    ),
  );

  summary.append(description, facts);
  content.append(detailArtwork(s), meta, title, summary);
  const feedPanel = el("div", null, "spot-feeds");
  content.append(feedPanel);
  disposeConditions = mountConditions(feedPanel, s);
  const actions = el("div", null, "detail-actions");
  const source = link("Check water quality ↗", s.conditionsSource.url);
  source.className = "primary";
  const bookmark = el(
    "button",
    state.saved.includes(s.id) ? "★ Saved" : "☆ Save spot",
    "outline",
  );
  bookmark.onclick = () => {
    save(s.id);
    bookmark.textContent = state.saved.includes(s.id)
      ? "★ Saved"
      : "☆ Save spot";
  };
  const contribute = el("button", "Add photo or local knowledge", "outline");
  contribute.onclick = () => {
    document.dispatchEvent(
      new CustomEvent("swimspots:edit-spot", { detail: s }),
    );
  };
  actions.append(source, bookmark, contribute);
  content.append(actions);
  const more = el("details", null, "detail-more");
  const moreSummary = el("summary");
  moreSummary.append(icon("More about this spot", "⋯"), el("span", "›", "disclosure-chevron"));
  more.append(moreSummary);
  more.append(
    el("h3", "Swim routes"),
    el("p", "No verified routes published for this spot yet."),
    el("h3", "About this listing"),
  );
  const provenance = el("p");
  provenance.append(
    s.source.url
      ? link(s.source.name, s.source.url)
      : document.createTextNode(s.source.name),
    document.createTextNode(
      ` · Listing reviewed ${s.source.checkedAt}. ${s.listingStatus === "community-reviewed" ? "Community entry point reviewed for publication; conditions and access can change." : "Coordinates are editorial estimates; access and facilities await local review."} Weather model times and water-quality sample dates are shown separately above.`,
    ),
  );
  more.append(provenance);
  if (s.communitySourceUrl) {
    const communitySource = el("p");
    communitySource.append(
      link("Community information source ↗", s.communitySourceUrl),
      document.createTextNode(
        s.communityReviewedAt
          ? ` · Reviewed ${new Date(s.communityReviewedAt).toLocaleDateString("en-NZ")}`
          : "",
      ),
    );
    more.append(communitySource);
  }
  content.append(more);
  const show = el("button", "Show on map", "primary");
  show.onclick = () => {
    $("#spot-dialog").close();
    if (map) {
      map.setView(s.coordinates, 13, { animate: false });
      $("#map").scrollIntoView({ block: "center", behavior: "instant" });
    }
  };
  if (map) content.append(show);
  if (!$("#spot-dialog").open) $("#spot-dialog").showModal();
  $("#spot-dialog").scrollTop = 0;
  history.replaceState(null, "", `#spot=${encodeURIComponent(s.id)}`);
}
function reset() {
  Object.assign(state, {
    query: "",
    type: "all",
    region: "all",
    savedOnly: false,
    location: null,
  });
  $("#search").value = "";
  $("#location-status").textContent = "";
  userMarker?.remove();
  document
    .querySelectorAll("[data-type]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.type === "all")),
    );
  render();
  fit();
}
$("#search").addEventListener("input", (e) => {
  state.query = e.target.value;
  render();
  fit();
});
document.querySelectorAll("[data-type]").forEach(
  (b) =>
    (b.onclick = () => {
      state.type = b.dataset.type;
      document
        .querySelectorAll("[data-type]")
        .forEach((t) => t.setAttribute("aria-pressed", String(t === b)));
      render();
      fit();
    }),
);
$("#reset").onclick = reset;
$("#saved").onclick = () => {
  state.savedOnly = !state.savedOnly;
  render();
  fit();
};
$("#near").onclick = () => {
  if (!navigator.geolocation) {
    $("#location-status").textContent =
      "Location is unavailable. Search by place instead.";
    return;
  }
  $("#near").disabled = true;
  $("#location-status").textContent = "Finding your location…";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.location = [position.coords.latitude, position.coords.longitude];
      $("#near").disabled = false;
      $("#location-status").textContent = "Centred on your location";
      userMarker?.remove();
      if (map) {
        userMarker = L.circleMarker(state.location, {
          radius: 7,
          color: "#fff",
          fillColor: "#306ad6",
          fillOpacity: 1,
        })
          .addTo(map)
          .bindTooltip("Your location");
        map.setView(state.location, 12, { animate: false });
      }
      render();
    },
    () => {
      $("#near").disabled = false;
      $("#location-status").textContent =
        "Could not get your location. Allow location access or search by place instead.";
    },
    { timeout: 10000, maximumAge: 60000 },
  );
};

$("#layers-toggle").onclick = () => {
  const panel = $("#layers-panel");
  const open = panel.hidden;
  panel.hidden = !open;
  $("#layers-toggle").setAttribute("aria-expanded", String(open));
};

function openSiteInfo(title, body) {
  const dialog = $("#site-info-dialog");
  $("#site-info-title").textContent = title;
  const content = $("#site-info-content");
  content.replaceChildren();
  if (Array.isArray(body)) {
    for (const item of body) content.append(item);
  } else {
    content.append(el("p", body));
  }
  if (!dialog.open) dialog.showModal();
}

$("#about-link").onclick = () =>
  openSiteInfo(
    "About Swimspots",
    "A simple map for discovering open-water swimming locations around Aotearoa New Zealand. Conditions, access and local information can change, so always check current official advice before swimming.",
  );

$("#contact-link").onclick = () =>
  openSiteInfo(
    "Contact",
    "A contact form will be added here. For now, this keeps a clear place in the interface for feedback and corrections.",
  );

$("#social-link").onclick = () =>
  openSiteInfo(
    "Follow Swimspots",
    "Social links will live here once the Swimspots channels are set up.",
  );

$("#share-link").onclick = async () => {
  const shareData = {
    title: "Swimspots NZ",
    text: "Find open-water swimming spots around Aotearoa New Zealand.",
    url: location.href,
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(location.href);
      openSiteInfo("Share", "Link copied to your clipboard.");
      return;
    }
  } catch {
    return;
  }
  openSiteInfo("Share", location.href);
};

document
  .querySelectorAll("dialog .close")
  .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
$("#spot-dialog").addEventListener("close", () => {
  disposeConditions();
  history.replaceState(null, "", location.pathname + location.search);
});
mountSubmission();
async function init() {
  try {
    const response = await fetch("/data/spots.json");
    if (!response.ok) throw new Error("load");
    const data = await response.json();
    spots = data.spots;
    try {
      const community = await fetch("/api/community-spots", {
        signal: AbortSignal.timeout(5000),
      });
      if (!community.ok) throw new Error("community");
      const extra = await community.json();
      for (const update of extra.updates || []) {
        const target = spots.find((s) => s.id === update.targetSpotId);
        if (!target) continue;
        target.access = update.access || target.access;
        target.parking = update.parking || target.parking;
        target.facilities = update.facilities || target.facilities;
        target.hazards = update.hazards || target.hazards;
        if (update.photo) target.photo = update.photo;
        target.listingStatus = "community-reviewed";
        target.communitySourceUrl = update.sourceUrl || "";
        target.communityReviewedAt = update.reviewedAt;
      }
      spots.push(...extra.spots);
    } catch {
      const note = document.querySelector(".collection-note");
      if (note)
        note.textContent =
          "Community locations could not load. Showing the starter collection.";
    }
    if (window.L) {
      map = L.map("map", {
        zoomControl: false,
        minZoom: 4,
        maxZoom: 17,
      }).setView([-41, 173], 5);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      const tiles = L.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          attribution:
            '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        },
      ).addTo(map);
      tiles.on("tileerror", () => {
        $("#map-status").hidden = false;
        $("#map-status").textContent =
          "Some map tiles could not load. You can still browse and search the spot list.";
      });
      markers = L.layerGroup().addTo(map);
    } else {
      $("#map-status").hidden = false;
      $("#map-status").textContent =
        "The map could not load. Browse spots in the list instead.";
    }
    render();
    if (map) {
      const desktop = window.matchMedia("(min-width: 781px)").matches;
      map.setView([-41.25, 173.2], desktop ? 6 : 5, { animate: false });
      requestAnimationFrame(() => map.invalidateSize(false));
    }
    const id = new URLSearchParams(location.hash.slice(1)).get("spot");
    const spot = spots.find((s) => s.id === id);
    if (spot) showSpot(spot);
  } catch {
    $("#result-count").textContent = "Spots could not load";
    const retry = el("button", "Try again", "primary");
    retry.onclick = () => location.reload();
    $("#results").classList.add("results-error-visible");
    $("#results").replaceChildren(
      el("p", "Check your connection and try again.", "empty"),
      retry,
    );
  }
}
init();
