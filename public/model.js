export const normalise = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function distanceKm(a, b) {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function selectSpots(spots, { query = '', type = 'all', region = 'all', savedOnly = false, saved = [], location = null } = {}) {
  return spots.filter(s => (type === 'all' || s.type === type) && (region === 'all' || s.region === region)
    && (!savedOnly || saved.includes(s.id)) && normalise(`${s.name} ${s.region} ${s.waterbody}`).includes(normalise(query.trim())))
    .sort((a, b) => location ? distanceKm(location, a.coordinates) - distanceKm(location, b.coordinates) : 0);
}
