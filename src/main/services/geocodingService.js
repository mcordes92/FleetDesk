const KNOWN_LOCATIONS = {
  kassel: { latitude: 51.3127, longitude: 9.4797 },
  'hauptniederlassung kassel': { latitude: 51.3127, longitude: 9.4797 },
  hamburg: { latitude: 53.5511, longitude: 9.9937 },
  berlin: { latitude: 52.52, longitude: 13.405 },
  muenchen: { latitude: 48.1372, longitude: 11.5755 },
  münchen: { latitude: 48.1372, longitude: 11.5755 },
  koeln: { latitude: 50.9375, longitude: 6.9603 },
  köln: { latitude: 50.9375, longitude: 6.9603 },
  frankfurt: { latitude: 50.1109, longitude: 8.6821 }
};

function normalizeLocation(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveCoordinates(db, query) {
  const normalized = normalizeLocation(query);
  if (!normalized) return null;
  const cached = db.prepare('SELECT latitude, longitude FROM geocoding_cache WHERE query = ?').get(normalized);
  if (cached) return cached.latitude == null || cached.longitude == null ? null : cached;
  const known = KNOWN_LOCATIONS[normalized] || null;
  db.prepare('INSERT INTO geocoding_cache (query, latitude, longitude, source) VALUES (?, ?, ?, ?)').run(normalized, known?.latitude ?? null, known?.longitude ?? null, known ? 'local' : 'unbekannt');
  return known;
}

async function geocodeWithOpenStreetMap(db, query) {
  const normalized = normalizeLocation(query);
  if (!normalized) return null;
  const cached = db.prepare('SELECT latitude, longitude FROM geocoding_cache WHERE query = ?').get(normalized);
  if (cached) return cached.latitude == null || cached.longitude == null ? null : cached;
  const local = KNOWN_LOCATIONS[normalized] || null;
  if (local) {
    db.prepare('INSERT INTO geocoding_cache (query, latitude, longitude, source) VALUES (?, ?, ?, ?)').run(normalized, local.latitude, local.longitude, 'local');
    return local;
  }
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=0&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'FleetDesk/1.0 (local desktop app)' } });
  if (!response.ok) throw new Error('OpenStreetMap-Geocoding konnte nicht erreicht werden.');
  const results = await response.json();
  const first = results[0];
  const coordinates = first ? { latitude: Number(first.lat), longitude: Number(first.lon) } : null;
  db.prepare('INSERT INTO geocoding_cache (query, latitude, longitude, source) VALUES (?, ?, ?, ?)').run(normalized, coordinates?.latitude ?? null, coordinates?.longitude ?? null, coordinates ? 'openstreetmap' : 'nicht gefunden');
  return coordinates;
}

module.exports = { resolveCoordinates, geocodeWithOpenStreetMap };
