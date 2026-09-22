const fields = [
  "name",
  "region",
  "waterbody",
  "type",
  "description",
  "access",
  "parking",
  "facilities",
  "hazards",
  "sourceUrl",
  "latitude",
  "longitude",
];
const key = "swimspots:suggestion-draft";
export function mountSubmission() {
  const form = document.querySelector("#suggest-form"),
    status = document.querySelector("#suggest-status"),
    button = form.querySelector("[type=submit]");
  let id = crypto.randomUUID(),
    busy = false,
    duplicateConfirmed = false;
  const field = (name) => form.elements.namedItem(name);
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (saved) {
      for (const name of fields)
        if (typeof saved[name] === "string") field(name).value = saved[name];
      if (typeof saved.id === "string") id = saved.id;
    }
  } catch {}
  function draft() {
    return Object.fromEntries(fields.map((n) => [n, field(n).value]));
  }
  form.addEventListener("input", () => {
    duplicateConfirmed = false;
    document.querySelector("#duplicate-confirm").hidden = true;
    try {
      localStorage.setItem(key, JSON.stringify({ ...draft(), id }));
    } catch {
      status.textContent =
        "Draft storage is unavailable. Keep this page open until you submit.";
    }
  });
  document.querySelector("#duplicate-confirm").onclick = () => {
    duplicateConfirmed = true;
    form.requestSubmit();
  };
  document.querySelector("#start-new").onclick = () => {
    form.reset();
    id = crypto.randomUUID();
    button.disabled = false;
    document.querySelector("#start-new").hidden = true;
    status.textContent = "";
    try {
      localStorage.removeItem(key);
    } catch {}
  };
  let pinMap, pin;

  document.querySelector("#contribute").onclick = () => {
    document.querySelector("#suggest-dialog").showModal();
    if (window.L && !pinMap) {
      pinMap = L.map("suggest-map", { scrollWheelZoom: false }).setView(
        [-41, 173],
        5,
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(pinMap);
      pinMap.on("click", (e) => {
        field("latitude").value = e.latlng.lat.toFixed(6);
        field("longitude").value = e.latlng.lng.toFixed(6);
        field("latitude").dispatchEvent(new Event("input", { bubbles: true }));
        updatePin();
      });
    }
    pinMap?.invalidateSize();
    updatePin();
  };
  function updatePin() {
    const lat = Number(field("latitude").value),
      lon = Number(field("longitude").value);
    if (
      !field("latitude").value ||
      !field("longitude").value ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    )
      return;
    if (pinMap) {
      pin?.remove();
      pin = L.marker([lat, lon]).addTo(pinMap);
    }
  }
  ["latitude", "longitude"].forEach((n) =>
    field(n).addEventListener("change", updatePin),
  );
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const d = draft();
    const data = {
      ...d,
      id,
      coordinates: [Number(d.latitude), Number(d.longitude)],
      consent: field("consent").checked,
      website: field("website").value,
      duplicateConfirmed,
    };
    busy = true;
    button.disabled = true;
    status.textContent = "Sending your suggestion…";
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.duplicates) {
          status.textContent = `Possible matches: ${result.duplicates.map((s) => s.name).join(", ")}. Check the existing spots first. If this is a separate entry point, confirm below.`;
          document.querySelector("#duplicate-confirm").hidden = false;
        } else
          status.textContent =
            result.error || "Could not submit. Your draft is still here.";
        button.disabled = false;
        return;
      }
      status.textContent = `Suggestion received. Reference: ${result.id}. Status: ${result.status}. Pending suggestions are visible only to reviewers until approved.`;
      document.querySelector("#duplicate-confirm").hidden = true;
      document.querySelector("#start-new").hidden = false;
      try {
        localStorage.removeItem(key);
      } catch {}
    } catch {
      status.textContent =
        "Could not confirm delivery. Your draft is still here; retrying uses the same reference to avoid duplicates.";
      button.disabled = false;
    } finally {
      clearTimeout(timer);
      busy = false;
    }
  };
}
