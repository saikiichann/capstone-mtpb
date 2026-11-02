// ============================================================================
// GPS → exact address (street, barangay, district), like the Marki app.
//
// Uses OpenStreetMap Nominatim: free, open source, no API key.
// Rules for the free public server (https://operations.osmfoundation.org/policies/nominatim/):
//   - send a User-Agent that names the app
//   - at most 1 request per second (we call it once per GPS fix, not in a loop)
//   - credit "© OpenStreetMap contributors" (shown on the photo stamp)
// For real MTPB use, the same code can point to a self-hosted Nominatim.
// ============================================================================

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'MTPB-Enforcer-App/1.0 (NTC capstone)';

export const OSM_CREDIT = '© OpenStreetMap contributors';

// District 3 of Manila (the scope of the study).
export const DISTRICT_3 = ['Sampaloc', 'Sta. Cruz', 'Quiapo', 'San Miguel'];

const DISTRICT_NAMES = [
  ['sampaloc', 'Sampaloc'],
  ['santa cruz', 'Sta. Cruz'],
  ['sta. cruz', 'Sta. Cruz'],
  ['sta cruz', 'Sta. Cruz'],
  ['quiapo', 'Quiapo'],
  ['san miguel', 'San Miguel'],
  ['binondo', 'Binondo'],
  ['san nicolas', 'San Nicolas'],
  ['tondo', 'Tondo'],
  ['ermita', 'Ermita'],
  ['malate', 'Malate'],
  ['intramuros', 'Intramuros'],
  ['paco', 'Paco'],
  ['pandacan', 'Pandacan'],
  ['santa ana', 'Sta. Ana'],
  ['sta. ana', 'Sta. Ana'],
  ['santa mesa', 'Sta. Mesa'],
  ['sta. mesa', 'Sta. Mesa'],
  ['san andres', 'San Andres'],
  ['port area', 'Port Area'],
];

const knownDistrict = (value) => {
  const lower = String(value ?? '').toLowerCase();
  const hit = DISTRICT_NAMES.find(([key]) => lower.includes(key));
  return hit ? hit[1] : null;
};

/** Manila barangays are numbered ("Barangay 471"); OSM puts them in different fields. */
const findBarangay = (a) => {
  const candidates = [a.quarter, a.neighbourhood, a.suburb, a.city_block, a.village, a.hamlet];
  return candidates.find((v) => /barangay|brgy/i.test(String(v ?? ''))) ?? null;
};

const findDistrict = (a) => {
  const candidates = [a.city_district, a.suburb, a.quarter, a.borough, a.neighbourhood];
  for (const value of candidates) {
    const name = knownDistrict(value);
    if (name) return name;
  }
  return null;
};

/** One readable line: "Dapitan Street, Barangay 471, Sampaloc, Manila". */
export const formatAddress = (addr) =>
  addr
    ? [addr.street, addr.barangay, addr.district, addr.city].filter(Boolean).join(', ')
    : '';

export const isInDistrict3 = (addr) => !!addr?.district && DISTRICT_3.includes(addr.district);

/**
 * Reverse geocodes GPS coordinates. Resolves to
 * { street, barangay, district, city, full } or throws if offline / no result.
 */
export async function reverseGeocode(lat, lng, { timeoutMs = 10000 } = {}) {
  const url =
    `${NOMINATIM_URL}?format=jsonv2&addressdetails=1&zoom=18` +
    `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Address lookup failed (${res.status}).`);
    const data = await res.json();
    if (!data || data.error || !data.address) throw new Error('No address found for this spot.');

    const a = data.address;
    return {
      street: a.road ?? a.pedestrian ?? a.footway ?? a.residential ?? null,
      barangay: findBarangay(a),
      district: findDistrict(a),
      city: a.city ?? a.town ?? a.municipality ?? null,
      full: data.display_name ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}