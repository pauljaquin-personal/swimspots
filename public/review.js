const $ = (s) => document.querySelector(s),
  make = (tag, text) => {
    const n = document.createElement(tag);
    if (text) n.textContent = text;
    return n;
  };
let token = "",
  busy = false;
const labels = {
  name: "Spot name",
  region: "Region",
  waterbody: "Waterbody",
  description: "Description",
  access: "Public access",
  parking: "Parking",
  facilities: "Facilities",
  hazards: "Hazards",
  sourceUrl: "Source URL",
  photoAlt: "Photo description",
  photoCredit: "Photo credit",
};
async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
function field(form, name, label, value, type = "text") {
  const l = make("label", label),
    input = make(type === "textarea" ? "textarea" : "input");
  input.name = name;
  input.value = value ?? "";
  if (type !== "textarea") input.type = type;
  if (type === "number") input.step = "any";
  if (type === "textarea") input.rows = 3;
  l.append(input);
  form.append(l);
  return input;
}
async function load() {
  if (busy) return;
  busy = true;
  $("#review-status").textContent = "Loading…";
  $("#review-list").replaceChildren();
  try {
    const { submissions } = await api(
      "/api/review?status=" + $("#review-filter").value,
    );
    $("#review-status").textContent = `${submissions.length} suggestion(s).`;
    for (const record of submissions) {
      const card = make("article");
      card.className = "review-card";
      card.append(
        make("h2", record.data.name),
        make(
          "p",
          `Reference ${record.id} · Submitted ${new Date(record.createdAt).toLocaleString("en-NZ")}`,
        ),
      );
      const form = make("form");
      for (const [name, label] of Object.entries(labels))
        field(
          form,
          name,
          label,
          record.data[name],
          [
            "description",
            "access",
            "parking",
            "facilities",
            "hazards",
          ].includes(name)
            ? "textarea"
            : name === "sourceUrl"
              ? "url"
              : "text",
        );
      const l = make("label", "Water type"),
        sel = make("select");
      sel.name = "type";
      for (const t of ["lake", "river", "sea", "pool"]) {
        const o = make("option", t);
        o.value = t;
        sel.append(o);
      }
      sel.value = record.data.type;
      l.append(sel);
      form.append(l);
      field(form, "latitude", "Latitude", record.data.coordinates[0], "number");
      field(
        form,
        "longitude",
        "Longitude",
        record.data.coordinates[1],
        "number",
      );
      if (record.data.photo) {
        const photo = make("img");
        photo.className = "review-photo";
        photo.src = "/api/review-photo/" + record.id;
        photo.alt = record.data.photoAlt || record.data.name + " submitted photograph";
        form.append(photo);
      }
      const source = make("a", "Open submitted source ↗");
      source.href = record.data.sourceUrl;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      form.append(source);
      const map = make("a", "Check coordinates on OpenStreetMap ↗");
      map.href = `https://www.openstreetmap.org/?mlat=${record.data.coordinates[0]}&mlon=${record.data.coordinates[1]}#map=16/${record.data.coordinates[0]}/${record.data.coordinates[1]}`;
      map.target = "_blank";
      map.rel = "noopener noreferrer";
      form.append(map);
      if (record.status === "pending") {
        const cl = make(
          "label",
          "I checked the location, public access, hazards and source.",
        );
        cl.className = "check-label";
        const check = make("input");
        check.type = "checkbox";
        check.name = "reviewConfirmed";
        cl.prepend(check);
        form.append(cl);
        field(form, "note", "Private review note", "", "textarea");
        const approve = make("button", "Approve and publish");
        approve.type = "submit";
        approve.className = "primary";
        const reject = make("button", "Reject suggestion");
        reject.type = "button";
        reject.className = "outline";
        form.append(approve, reject);
        const result = make("p");
        result.setAttribute("role", "status");
        form.append(result);
        async function decide(status) {
          approve.disabled = reject.disabled = true;
          const values = Object.fromEntries(new FormData(form));
          values.coordinates = [
            Number(values.latitude),
            Number(values.longitude),
          ];
          try {
            await api("/api/review/" + record.id, {
              method: "POST",
              body: JSON.stringify({
                status,
                data: values,
                note: values.note,
                reviewConfirmed: check.checked,
              }),
            });
            await load();
          } catch (e) {
            result.textContent = e.message;
            approve.disabled = reject.disabled = false;
          }
        }
        form.onsubmit = (e) => {
          e.preventDefault();
          decide("approved");
        };
        reject.onclick = () => decide("rejected");
      } else {
        form.append(make("p", `Review note: ${record.note || ""}`));
        form
          .querySelectorAll("input,textarea,select")
          .forEach((e) => (e.disabled = true));
      }
      card.append(form);
      $("#review-list").append(card);
    }
  } catch (e) {
    $("#review-status").textContent = e.message;
  } finally {
    busy = false;
  }
}
$("#review-login").onsubmit = (e) => {
  e.preventDefault();
  token = $("#review-token").value.trim();
  $("#review-token").value = "";
  load();
};
$("#review-filter").onchange = load;
load();
