/* ------------------------------------------------------------------
   LOCATION DETAILS — district, barangay and exact spot of a violation

   For the Release Officers (assigned per district), so they know where
   the vehicle actually is, not just the area.

   Newer violations from the enforcer app carry `address`
   (street, barangay, district — OpenStreetMap, like the Marki app) and
   `locationCoords` (GPS). Older ones only have `location`
   ("Sampaloc - España Boulevard") and `barangay` (which holds the area,
   e.g. "Sampaloc"), so the district is worked out from those.
------------------------------------------------------------------ */
import type { DocumentData } from "firebase/firestore";

export type LocationDetails = {
  /** "Sampaloc", "Sta. Cruz"… or null if unknown */
  district: string | null;
  /** "Barangay 471" — only when the enforcer app found it */
  barangay: string | null;
  /** Street / exact spot, else the selected location */
  exact: string;
  coords: { lat: number; lng: number } | null;
  /** Opens the spot in Google Maps (phone: the Maps app) */
  mapUrl: string | null;
};

const DISTRICTS: [string, string][] = [
  ["sampaloc", "Sampaloc"],
  ["santa cruz", "Sta. Cruz"],
  ["sta. cruz", "Sta. Cruz"],
  ["sta cruz", "Sta. Cruz"],
  ["quiapo", "Quiapo"],
  ["san miguel", "San Miguel"],
  ["binondo", "Binondo"],
  ["san nicolas", "San Nicolas"],
  ["tondo", "Tondo"],
  ["ermita", "Ermita"],
  ["malate", "Malate"],
  ["intramuros", "Intramuros"],
  ["paco", "Paco"],
  ["pandacan", "Pandacan"],
  ["santa ana", "Sta. Ana"],
  ["sta. ana", "Sta. Ana"],
  ["santa mesa", "Sta. Mesa"],
  ["sta. mesa", "Sta. Mesa"],
  ["san andres", "San Andres"],
  ["port area", "Port Area"],
];

/** "Santa Cruz - Rizal Avenue" / "Sta. Cruz" → "Sta. Cruz" */
export const districtFromText = (value: unknown): string | null => {
  const lower = String(value ?? "").toLowerCase();
  if (!lower) return null;
  const hit = DISTRICTS.find(([key]) => lower.includes(key));
  return hit ? hit[1] : null;
};

/** Streets of the enforcer app's location list → district (for records without a district). */
const STREET_DISTRICT: [string, string][] = [
  ["españa", "Sampaloc"],
  ["espana", "Sampaloc"],
  ["lacson", "Sampaloc"],
  ["earnshaw", "Sampaloc"],
  ["dapitan", "Sampaloc"],
  ["p. noval", "Sampaloc"],
  ["noval", "Sampaloc"],
  ["legarda", "Sampaloc"],
  ["recto", "Sampaloc"],
  ["rizal avenue", "Sta. Cruz"],
  ["blumentritt", "Sta. Cruz"],
  ["oroquieta", "Sta. Cruz"],
  ["tayuman", "Sta. Cruz"],
  ["bambang", "Sta. Cruz"],
  ["fugoso", "Sta. Cruz"],
  ["quezon boulevard", "Quiapo"],
  ["quezon blvd", "Quiapo"],
  ["hidalgo", "Quiapo"],
  ["villalobos", "Quiapo"],
  ["palanca", "Quiapo"],
  ["evangelista", "Quiapo"],
  ["ayala bridge", "San Miguel"],
  ["malacañang", "San Miguel"],
  ["malacanang", "San Miguel"],
  ["nepomuceno", "San Miguel"],
];

const districtFromStreet = (value: unknown): string | null => {
  const lower = String(value ?? "").toLowerCase();
  if (!lower) return null;
  const hit = STREET_DISTRICT.find(([key]) => lower.includes(key));
  return hit ? hit[1] : null;
};

const text = (value: unknown): string | null => {
  const s = String(value ?? "").trim();
  return s && s !== "—" ? s : null;
};

export function locationDetailsOf(data: DocumentData): LocationDetails {
  const address = (data.address ?? {}) as Record<string, unknown>;
  const location = text(data.location);

  const district =
    districtFromText(address.district) ??
    districtFromText(data.barangay) ??
    districtFromText(location) ??
    districtFromText(data.district) ??
    districtFromStreet(address.street) ??
    districtFromStreet(location);

  const barangay =
    text(address.barangay) ??
    // Some records already store a real barangay ("Barangay 471")
    (/barangay|brgy/i.test(String(data.barangay ?? "")) ? text(data.barangay) : null);

  const street = text(address.street);
  // "Sampaloc - España Boulevard" → "España Boulevard" (the district has its own column)
  const spot = location?.includes(" - ") ? location.split(" - ").slice(1).join(" - ") : location;
  const exact = street ?? spot ?? "—";

  const raw = data.locationCoords as { lat?: unknown; lng?: unknown } | undefined;
  const lat = Number(raw?.lat);
  const lng = Number(raw?.lng);
  const coords = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null;

  return {
    district,
    barangay,
    exact,
    coords,
    mapUrl: coords ? `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}` : null,
  };
}

/** "Dapitan Street, Barangay 471, Sampaloc" for messages and logs. */
export const placeLine = (d: LocationDetails): string =>
  [d.exact !== "—" ? d.exact : null, d.barangay, d.district].filter(Boolean).join(", ") || "—";
