import { selectSpots, distanceKm } from './model.js';
const $ = (s) => document.querySelector(s);
const state = { query: '', type: 'all', region: 'all', savedOnly: false, saved: [], location: null };
let spots = [], map, markers, userMarker;
try { const saved = JSON.parse(localStorage.getItem('swimspots:saved') || '[]'); state.saved = Array.isArray(saved) ? saved.filter(x => typeof x === 'string') : []; } catch { /* Storage is optional. */ }
function el(tag, text, className) { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; }
function link(text, href) { const a = el('a', text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
function save(id) { state.saved = state.saved.includes(id) ? state.saved.filter(s => s !== id) : [...state.saved, id]; try { localStorage.setItem('swimspots:saved', JSON.stringify(state.saved)); } catch { $('#location-status').textContent = 'Saved for this visit only; browser storage is unavailable.'; } render(); }
function fit() { const visible = selectSpots(spots, state); if (map && visible.length) map.fitBounds(visible.map(s => s.coordinates), { padding: [55, 55], maxZoom: 12, animate: false }); }
function render() {
  const visible = selectSpots(spots, state); $('#results').replaceChildren();
  $('#result-count').textContent = `${visible.length} ${state.savedOnly ? 'saved ' : ''}spot${visible.length === 1 ? '' : 's'}${state.location ? ' · nearest first' : ' to explore'}`;
  $('#saved-count').textContent = spots.filter(s => state.saved.includes(s.id)).length;
  $('#saved').setAttribute('aria-pressed', String(state.savedOnly)); $('#saved').classList.toggle('nav-active', state.savedOnly); $('#explore').classList.toggle('nav-active', !state.savedOnly);
  markers?.clearLayers();
  if (!visible.length) { const empty = el('div', null, 'empty'); empty.append(el('strong', state.savedOnly ? 'Your next favourite is out there.' : 'No spots found just yet.'), el('p', state.savedOnly ? 'Save a spot with the star, or reset your filters.' : 'Try another place or reset your filters. Our starter collection is still growing.')); $('#results').append(empty); }
  visible.forEach(s => {
    const card = el('article', null, 'spot-card'); const open = el('button', null, 'card-open'); open.setAttribute('aria-label', `View ${s.name}`);
    const art = el('span', '≋', `spot-art ${s.type}`); art.setAttribute('aria-hidden', 'true'); const copy = el('span', null, 'card-copy');
    copy.append(el('span', s.type, 'type-label'), el('strong', s.name), el('small', s.region), el('small', state.location ? `${distanceKm(state.location, s.coordinates).toFixed(1)} km away · straight line` : s.waterbody));
    open.append(art, copy); open.onclick = () => showSpot(s); const star = el('button', state.saved.includes(s.id) ? '★' : '☆', 'save'); star.setAttribute('aria-label', `${state.saved.includes(s.id) ? 'Unsave' : 'Save'} ${s.name}`); star.setAttribute('aria-pressed', String(state.saved.includes(s.id))); star.onclick = () => save(s.id); card.append(open, star); $('#results').append(card);
    if (map) { const marker = L.marker(s.coordinates, { title: s.name, alt: s.name, icon: L.divIcon({ className: `pin ${s.type}`, html: '≋', iconSize: [31, 31], iconAnchor: [15, 15] }) }).addTo(markers).bindTooltip(el('span', s.name)).on('click', () => showSpot(s)); marker.getElement().setAttribute('aria-label', `View ${s.name} on map`); }
  });
}
function showSpot(s) {
  const content = $('#spot-content'); content.replaceChildren();
  const meta = el('div', null, 'detail-meta'); meta.append(el('span', s.type.toUpperCase(), 'badge'), el('span', s.region, 'badge'), el('span', 'Starter listing · verification pending', 'badge'));
  const title = el('h2', s.name); title.id = 'spot-title'; content.append(el('div', null, 'detail-banner'), meta, title, el('p', s.description));
  content.append(el('h3', 'Before you get in'), el('p', 'Live conditions are not connected yet. A listing is not a recommendation to swim today. Check the source below and local signs.'));
  const conditions = el('div', null, 'conditions'); ['Water quality', 'Water temperature', 'Wind & weather', s.type === 'sea' ? 'Tides & currents' : 'Water level & flow'].forEach(label => { const item = el('div', null, 'condition'); item.append(el('span', label), el('strong', 'Not available')); conditions.append(item); }); content.append(conditions);
  const actions = el('div', null, 'detail-actions'); const source = link('Check water quality ↗', s.conditionsSource.url); source.className = 'primary'; const bookmark = el('button', state.saved.includes(s.id) ? '★ Saved' : '☆ Save spot', 'outline'); bookmark.onclick = () => { save(s.id); bookmark.textContent = state.saved.includes(s.id) ? '★ Saved' : '☆ Save spot'; }; actions.append(source, bookmark); content.append(actions);
  content.append(el('h3', 'Access & local knowledge')); const details = el('dl'); for (const [label, value] of Object.entries({ Access: s.access, Parking: s.parking, Facilities: s.facilities, 'Hazards & local advice': s.hazards, Location: `${s.coordinates.join(', ')} · approximate, not a verified water-entry point` })) details.append(el('dt', label), el('dd', value)); content.append(details);
  content.append(el('h3', 'Swim routes'), el('p', 'No verified routes published for this spot yet.'));
  content.append(el('h3', 'About this listing')); const provenance = el('p'); provenance.append(link(s.source.name, s.source.url), document.createTextNode(` · Listing source reviewed ${s.source.checkedAt}. Coordinates are editorial estimates; access and facilities await local review. No live observation timestamp is available.`)); content.append(provenance);
  const show = el('button', 'Show this spot on the map', 'primary'); show.onclick = () => { $('#spot-dialog').close(); if (map) { map.setView(s.coordinates, 13, { animate: false }); $('#map').scrollIntoView({ block: 'center', behavior: 'instant' }); } }; if (map) content.append(show);
  if (!$('#spot-dialog').open) $('#spot-dialog').showModal(); $('#spot-dialog').scrollTop = 0;
  history.replaceState(null, '', `#spot=${encodeURIComponent(s.id)}`);
}
function reset() { Object.assign(state, { query: '', type: 'all', region: 'all', savedOnly: false, location: null }); $('#search').value = ''; $('#region').value = 'all'; $('#location-status').textContent = ''; userMarker?.remove(); document.querySelectorAll('[data-type]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.type === 'all'))); render(); fit(); }
$('#search').addEventListener('input', e => { state.query = e.target.value; render(); fit(); });
$('#region').onchange = e => { state.region = e.target.value; render(); fit(); };
document.querySelectorAll('[data-type]').forEach(b => b.onclick = () => { state.type = b.dataset.type; document.querySelectorAll('[data-type]').forEach(t => t.setAttribute('aria-pressed', String(t === b))); render(); fit(); });
$('#reset').onclick = reset; $('#fit-map').onclick = fit; $('#saved').onclick = () => { state.savedOnly = !state.savedOnly; render(); fit(); }; $('#explore').onclick = () => { state.savedOnly = false; render(); fit(); };
$('#near').onclick = () => {
  if (!navigator.geolocation) { $('#location-status').textContent = 'Location is unavailable. Search by town or region instead.'; return; }
  $('#near').disabled = true; $('#location-status').textContent = 'Finding your location…';
  navigator.geolocation.getCurrentPosition(position => { state.location = [position.coords.latitude, position.coords.longitude]; $('#near').disabled = false; $('#location-status').textContent = 'Sorted by straight-line distance. Your location is used only on this device.'; userMarker?.remove(); if (map) userMarker = L.circleMarker(state.location, { radius: 7, color: '#fff', fillColor: '#306ad6', fillOpacity: 1 }).addTo(map).bindTooltip('Your location'); render(); fit(); }, () => { $('#near').disabled = false; $('#location-status').textContent = 'Could not get your location. Allow location access or search by town instead.'; }, { timeout: 10000, maximumAge: 60000 });
};
document.querySelectorAll('dialog .close').forEach(b => b.onclick = () => b.closest('dialog').close());
$('#spot-dialog').addEventListener('close', () => history.replaceState(null, '', location.pathname + location.search));
$('#contribute').onclick = () => $('#suggest-dialog').showModal();
$('#suggest-form').onsubmit = e => { e.preventDefault(); const suggestion = { schemaVersion: 1, ...Object.fromEntries(new FormData(e.target)), moderationStatus: 'pending', createdAt: new Date().toISOString() }; const url = URL.createObjectURL(new Blob([JSON.stringify(suggestion, null, 2)], { type: 'application/json' })); const a = el('a'); a.href = url; a.download = 'swimspots-suggestion.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); $('#suggest-status').textContent = 'Suggestion downloaded. Share the file with the maintainer for review; it has not been submitted.'; };
async function init() {
  try {
    const response = await fetch('/data/spots.json'); if (!response.ok) throw new Error('load'); const data = await response.json(); spots = data.spots;
    [...new Set(spots.map(s => s.region))].sort().forEach(r => { const o = el('option', r); o.value = r; $('#region').append(o); });
    if (window.L) {
      map = L.map('map', { zoomControl: false, minZoom: 4, maxZoom: 17 }).setView([-41, 173], 5); L.control.zoom({ position: 'bottomright' }).addTo(map);
      const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
      tiles.on('tileerror', () => { $('#map-status').hidden = false; $('#map-status').textContent = 'Some map tiles could not load. You can still browse and search the spot list.'; }); markers = L.layerGroup().addTo(map);
    } else { $('#map-status').hidden = false; $('#map-status').textContent = 'The map could not load. Browse spots in the list instead.'; }
    render(); fit(); const id = new URLSearchParams(location.hash.slice(1)).get('spot'); const spot = spots.find(s => s.id === id); if (spot) showSpot(spot);
  } catch { $('#result-count').textContent = 'Spots could not load'; const retry = el('button', 'Try again', 'primary'); retry.onclick = () => location.reload(); $('#results').replaceChildren(el('p', 'Check your connection and try again.', 'empty'), retry); }
}
init();
