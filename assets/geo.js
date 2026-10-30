/** Pure, side-effect-free functions shared by the explorer and tests. */
export const CITY_PRESETS = Object.freeze({
  islamabad: { label: 'Islamabad, Pakistan', lat: 33.6844, lon: 73.0479 },
  lahore: { label: 'Lahore, Pakistan', lat: 31.5204, lon: 74.3587 },
  karachi: { label: 'Karachi, Pakistan', lat: 24.8607, lon: 67.0011 },
  peshawar: { label: 'Peshawar, Pakistan', lat: 34.0151, lon: 71.5249 },
  quetta: { label: 'Quetta, Pakistan', lat: 30.1798, lon: 66.9750 },
  muzaffarabad: { label: 'Muzaffarabad, Pakistan', lat: 34.3551, lon: 73.4711 },
  delhi: { label: 'New Delhi, India', lat: 28.6139, lon: 77.2090 },
  kathmandu: { label: 'Kathmandu, Nepal', lat: 27.7172, lon: 85.3240 },
  tokyo: { label: 'Tokyo, Japan', lat: 35.6762, lon: 139.6503 },
  istanbul: { label: 'Istanbul, Türkiye', lat: 41.0082, lon: 28.9784 },
  losangeles: { label: 'Los Angeles, USA', lat: 34.0522, lon: -118.2437 },
  jakarta: { label: 'Jakarta, Indonesia', lat: -6.2088, lon: 106.8456 },
  reykjavik: { label: 'Reykjavík, Iceland', lat: 64.1466, lon: -21.9426 },
});
const rad = x => x * Math.PI / 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(clamp(a, 0, 1)), Math.sqrt(1 - clamp(a, 0, 1)));
}
export function normalizeGeojson(payload) {
  if (!payload || payload.type !== 'FeatureCollection' || !Array.isArray(payload.features)) {
    throw new Error('Expected a USGS GeoJSON FeatureCollection');
  }
  const unique = new Set();
  return payload.features.flatMap(feature => {
    const c = feature?.geometry?.coordinates;
    const p = feature?.properties;
    const id = String(feature?.id ?? '');
    if (!id || unique.has(id) || !Array.isArray(c) || c.length < 2 || !p) return [];
    const [lon, lat, depth] = c;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || !Number.isFinite(p.mag) || !Number.isFinite(p.time)) return [];
    unique.add(id);
    return [{
      id, lat, lon, depth: Number.isFinite(depth) ? Math.max(0, depth) : null,
      mag: p.mag, time: p.time, place: typeof p.place === 'string' ? p.place : 'Location not reported',
      url: typeof p.url === 'string' && /^https:\/\/earthquake\.usgs\.gov\//.test(p.url) ? p.url : '',
    }];
  }).sort((a, b) => b.time - a.time);
}
export function filterEvents(events, { now = Date.now(), days = 30, minMag = 2.5, city = CITY_PRESETS.islamabad, radiusKm = 500, cityOnly = false, replayDay = days } = {}) {
  const start = now - days * 86400000;
  const cutoff = start + Math.min(days, Math.max(0, replayDay)) * 86400000;
  return events.filter(event => event.mag >= minMag && event.time >= start && event.time <= now && event.time <= cutoff && (!cityOnly || haversineKm(city.lat, city.lon, event.lat, event.lon) <= radiusKm));
}
export function eventStatistics(events) {
  if (!events.length) return { count: 0, strongest: null, avgDepth: null };
  const knownDepths = events.filter(e => e.depth !== null).map(e => e.depth);
  return { count: events.length, strongest: events.reduce((m, e) => e.mag > m.mag ? e : m, events[0]), avgDepth: knownDepths.length ? knownDepths.reduce((a, b) => a + b, 0) / knownDepths.length : null };
}
export function makeRadiusPolygon(lat, lon, km, steps = 100) {
  const ring = [];
  const angularDistance = km / 6371.0088;
  const latitude = rad(lat), longitude = rad(lon);
  for (let n = 0; n <= steps; n++) {
    const bearing = n / steps * 2 * Math.PI;
    const newLat = Math.asin(Math.sin(latitude) * Math.cos(angularDistance) + Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing));
    const newLon = longitude + Math.atan2(Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude), Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(newLat));
    let degreesLon = newLon * 180 / Math.PI;
    while (degreesLon > 180) degreesLon -= 360;
    while (degreesLon < -180) degreesLon += 360;
    ring.push([degreesLon, newLat * 180 / Math.PI]);
  }
  return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} }] };
}
export const toFeatureCollection = events => ({ type: 'FeatureCollection', features: events.map(e => ({ type: 'Feature', id: e.id, properties: { id: e.id, mag: e.mag, place: e.place, time: e.time, depth: e.depth }, geometry: { type: 'Point', coordinates: [e.lon, e.lat] } })) });
export const emptyFeatureCollection = () => ({ type: 'FeatureCollection', features: [] });
export function dailyHistogram(events, now, days) {
  const start = now - days * 86400000;
  const counts = Array.from({ length: days }, () => 0);
  for (const e of events) {
    const day = Math.floor((e.time - start) / 86400000);
    if (day >= 0 && day <= days) counts[Math.min(day, days - 1)]++;
  }
  return counts;
}
export function formatTime(ms) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Karachi'
  }).format(ms) + ' PKT';
}