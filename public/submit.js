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
  "photoAlt",
  "photoCredit",
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
    duplicateConfirmed = false,
    targetSpotId = null;
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
  function setCoreLocked(locked) {
    for (const name of ["name", "region", "waterbody", "type", "latitude", "longitude", "description"])
      field(name).disabled = locked;
  }
  function setMode(spot = null) {
    targetSpotId = spot?.id || null;
    if (spot) {
      form.reset();
      id = crypto.randomUUID();
      duplicateConfirmed = true;
      const values = {
        name: spot.name,
        region: spot.region,
        waterbody: spot.waterbody,
        type: spot.type,
        latitude: String(spot.coordinates[0]),
        longitude: String(spot.coordinates[1]),
        description: spot.description,
        access: spot.access,
        parking: spot.parking || "",
        facilities: spot.facilities || "",
        hazards: spot.hazards,
        sourceUrl: "",
        photoAlt: "",
        photoCredit: "",
      };
      for (const [name, value] of Object.entries(values)) field(name).value = value;
      setCoreLocked(true);
      document.querySelector("#suggest-title").textContent = `Add to ${spot.name}`;
      button.textContent = "Submit update for review";
    } else {
      setCoreLocked(false);
      document.querySelector("#suggest-title").textContent = "Know a good spot?";
      button.textContent = "Submit for review";
    }
    document.querySelector("#duplicate-confirm").hidden = true;
    document.querySelector("#start-new").hidden = true;
    status.textContent = "";
    updatePin();
  }
  document.querySelector("#start-new").onclick = () => {
    form.reset();
    setMode(null);
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
    if (targetSpotId) {
      form.reset();
      id = crypto.randomUUID();
    }
    setMode(null);
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
  document.addEventListener("swimspots:edit-spot", (event) => {
    setMode(event.detail);
    document.querySelector("#spot-dialog")?.close();
    document.querySelector("#suggest-dialog").showModal();
    if (window.L && !pinMap) {
      pinMap = L.map("suggest-map", { scrollWheelZoom: false }).setView(
        event.detail.coordinates,
        13,
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(pinMap);
      pinMap.on("click", (e) => {
        if (targetSpotId) return;
        field("latitude").value = e.latlng.lat.toFixed(6);
        field("longitude").value = e.latlng.lng.toFixed(6);
        updatePin();
      });
    }
    pinMap?.setView(event.detail.coordinates, 13);
    pinMap?.invalidateSize();
    updatePin();
  });
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
    const photo = field("photo").files?.[0] || null;
    if (photo) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(photo.type)) {
        status.textContent = "Use a JPEG, PNG or WebP photograph.";
        return;
      }
      if (photo.size > 8 * 1024 * 1024) {
        status.textContent = "Photo must be 8 MB or smaller.";
        return;
      }
    }
    const d = draft();
    const data = {
      ...d,
      id,
      ...(targetSpotId ? { targetSpotId } : {}),
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
      if (photo) {
        status.textContent = "Suggestion received. Uploading photograph…";
        const photoResponse = await fetch(
          "/api/submission-photo/" + encodeURIComponent(result.id),
          {
            method: "PUT",
            headers: { "Content-Type": photo.type },
            body: photo,
            signal: controller.signal,
          },
        );
        const photoResult = await photoResponse.json();
        if (!photoResponse.ok) {
          status.textContent =
            `Suggestion received (reference: ${result.id}), but the photograph was not uploaded: ${photoResult.error || "upload failed"}. Press Submit for review again to retry the photo.`;
          button.disabled = false;
          return;
        }
      }
      status.textContent = `${targetSpotId ? "Update" : "Suggestion"} received. Reference: ${result.id}. Status: ${result.status}.${photo ? " Photograph uploaded for private review." : ""} Pending submissions are visible only to reviewers until approved.`;
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
