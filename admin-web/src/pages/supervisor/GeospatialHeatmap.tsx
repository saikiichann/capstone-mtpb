/* ------------------------------------------------------------------
   SUPERVISOR — Geospatial Heatmap (/supervisor/heatmap)

   The Supervisor's own page: same content as the OIC's Geospatial Heatmap, but
   with the Supervisor's sidebar (no Payment/Finance; links stay on
   /supervisor/...). The Supervisor monitors operations and approves
   vehicle release; payments are not handled here.
   Monitoring.
   Styles: ./GeospatialHeatmap.css (a copy of the OIC page's CSS).
------------------------------------------------------------------ */
import { useState, useEffect, useRef, useMemo, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { ListFilter, LocateFixed, MousePointerClick } from "lucide-react";
import {
  MapContainer,
  TileLayer,
  Polygon,
  Marker,
  Popup,
  Circle,
  Tooltip,
  ZoomControl,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./GeospatialHeatmap.css";


import overviewIcon from "../../assets/overview.png";
import sectorAnalyticsIcon from "../../assets/sectoranalytics.png";
import mapIcon from "../../assets/map.png";
import clampingIcon from "../../assets/clamping.png";
import impoundingIcon from "../../assets/impounding.png";
import historyIcon from "../../assets/history.png";
import releaseRequestIcon from "../../assets/releaserequest.png";
import queueIcon from "../../assets/queue.png";
import releaseLogIcon from "../../assets/releaselog.png";
import fieldUpdateIcon from "../../assets/fieldupdate.png";
import operationSchedulerIcon from "../../assets/scheduler.png";
import AppTopbar from "../../components/AppTopbar";
import AppSidebar from "../../components/AppSidebar";

/* ------------------------------------------------------------------
   TYPES
------------------------------------------------------------------ */
type RoleSlug =
  | "oic"
  | "it-admin"
  | "supervisor"
  | "record-officer"
  | "release-officer"
  | "finance"
  | "clamping-staff"
  | "impounding-staff";

type CurrentUser = { name: string; role: RoleSlug };

/**
 * ⚠️ CHANGED: Kinuha na ang exact location mula sa `locationCoords` (lat/lng)
 * imbes na `barangay` text. Mas accurate ang pin position at hindi na
 * aasa sa text field na madalas walang laman.
 */
type ViolationPoint = {
  lat: number;
  lng: number;
  barangay: string | null;
  violationType: string | null;
  cin: string | null;
  plateNo: string | null;
  location: string | null;
  recordedAt: Date | null;
};

type AreaStat = {
  name: string;
  count: number;
  topType: string;
  color: string;
  /** Pin position: the area's fixed center, or the middle of its clamps. */
  center: [number, number];
  /** Streets with the most clamps in this area (up to 3). */
  places: string[];
  latest: Date | null;
};

/** What the map should fly to (set by clicking a list item or a zone). */
type MapFocus = {
  /** "area:<name>" or "zone:<key>" — which popup to open on arrival. */
  target: string;
  lat: number;
  lng: number;
  zoom: number;
  /** Changes on every click, so clicking the same item again still flies. */
  stamp: number;
};

/** Clamps close to each other (same ~150 m cell), shown as one heat zone. */
type HeatZone = {
  key: string;
  lat: number;
  lng: number;
  count: number;
  color: string;
  radius: number;
  places: string[];
  /** Most common violation types in this spot (up to 3). */
  types: string[];
  latest: Date | null;
};

type NavItem = {
  label: string;
  icon: string;
  path: string;
  active?: boolean;
};

type NavGroup = { label: string; items: NavItem[] };

/* ------------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------------ */
const SECTOR_ID = "sector-3";
const UNKNOWN_TYPE = "Not recorded";
const UNKNOWN_AREA = "Unassigned";

const ROLE_LABELS: Record<RoleSlug, string> = {
  oic: "Officer in Charge",
  "it-admin": "IT Admin",
  supervisor: "Supervisor",
  "record-officer": "Record Officer",
  "release-officer": "Release Officer",
  finance: "Finance",
  "clamping-staff": "Clamping Staff",
  "impounding-staff": "Impounding Staff",
};

/** Map pin positions for the Sector 3 areas. */
const AREA_CENTERS: Record<string, [number, number]> = {
  "San Nicolas": [14.6057, 120.9698],
  "Sta. Cruz": [14.6091, 120.9822],
  Binondo: [14.6019, 120.9721],
  Quiapo: [14.5996, 120.9842],
  Sampaloc: [14.6085, 120.9895],
  "San Miguel": [14.594, 120.9925],
};

/** Different spellings of the same area collapse to one name. */
const AREA_ALIASES: Record<string, string> = {
  "san nicolas": "San Nicolas",
  "sta cruz": "Sta. Cruz",
  "santa cruz": "Sta. Cruz",
  binondo: "Binondo",
  quiapo: "Quiapo",
  sampaloc: "Sampaloc",
  "san miguel": "San Miguel",
};

const MANILA_D3_CENTER: [number, number] = [14.604, 120.978];

// Covers every Sector 3 location the enforcer app offers (Sampaloc, Sta.
// Cruz, Quiapo, San Miguel, Binondo, San Nicolas). Approximate rectangle.
const DISTRICT_3_BOUNDARY: [number, number][] = [
  [14.6245, 120.964],
  [14.6245, 120.9965],
  [14.5905, 120.9965],
  [14.5905, 120.964],
];

const OUTER_MASK: [number, number][] = [
  [14.5, 120.9],
  [14.5, 121.05],
  [14.7, 121.05],
  [14.7, 120.9],
];

const MAX_BOUNDS: [[number, number], [number, number]] = [
  [14.585, 120.955],
  [14.629, 121.003],
];

/**
 * Coordinates of the locations the enforcer app offers
 * (src/screens/ClampingDetailsScreen.js, LOCATIONS). The enforcer app saves
 * the phone's GPS first; when that GPS is outside Sector 3 (e.g. testing
 * away from the area), the clamp is placed at its recorded location instead.
 */
const KNOWN_LOCATIONS: Record<string, [number, number]> = {
  "Sampaloc - España Boulevard": [14.6095, 120.989],
  "Sampaloc - Lacson Avenue": [14.6118, 120.9937],
  "Sampaloc - Earnshaw Street": [14.6082, 120.9856],
  "Sampaloc - Dapitan Street": [14.6132, 120.9876],
  "Sampaloc - P. Noval Street": [14.6108, 120.9895],
  "Sampaloc - A.H. Lacson Avenue": [14.6118, 120.9937],
  "Sampaloc - Legarda Street": [14.6003, 120.9925],
  "Sampaloc - Recto Avenue": [14.6042, 120.9889],
  "Santa Cruz - Rizal Avenue": [14.6172, 120.9818],
  "Santa Cruz - Blumentritt Road": [14.6229, 120.9845],
  "Santa Cruz - Oroquieta Street": [14.6104, 120.9829],
  "Santa Cruz - Tayuman Street": [14.618, 120.9828],
  "Santa Cruz - Bambang Street": [14.6118, 120.9819],
  "Santa Cruz - Fugoso Street": [14.6106, 120.9832],
  "Quiapo - Quezon Boulevard": [14.5987, 120.9853],
  "Quiapo - Hidalgo Street": [14.5964, 120.9865],
  "Quiapo - Villalobos Street": [14.5977, 120.9852],
  "Quiapo - Palanca Street": [14.5971, 120.9842],
  "Quiapo - Evangelista Street": [14.5965, 120.9848],
  "San Miguel - Ayala Bridge": [14.5921, 120.9898],
  "San Miguel - Malacañang Area": [14.5941, 120.9947],
  "San Miguel - Nepomuceno Street": [14.5952, 120.9935],
};

const insideMap = (lat: number, lng: number): boolean =>
  lat >= MAX_BOUNDS[0][0] &&
  lat <= MAX_BOUNDS[1][0] &&
  lng >= MAX_BOUNDS[0][1] &&
  lng <= MAX_BOUNDS[1][1];

/** "Sampaloc – España Blvd." style differences don't matter. */
const locationKey = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9ñ]+/g, " ").trim();

const KNOWN_LOCATION_KEYS: Map<string, [number, number]> = new Map(
  Object.entries(KNOWN_LOCATIONS).map(([name, coords]) => [locationKey(name), coords])
);

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Dashboard",
    items: [
      { label: "Overview", icon: overviewIcon, path: "/supervisor" },
      {
        label: "Sector Analytics",
        icon: sectorAnalyticsIcon,
        path: "/supervisor/sector-analytics",
      },
      {
        label: "Geospatial Heatmap",
        icon: mapIcon,
        path: "/supervisor/heatmap",
        active: true,
      },
    ],
  },
  {
    label: "Enforcement",
    items: [
      { label: "Clamping Log", icon: clampingIcon, path: "/supervisor/clamping" },
      {
        label: "Impounding Log",
        icon: impoundingIcon,
        path: "/supervisor/impounding",
      },
      {
        label: "Vehicle History",
        icon: historyIcon,
        path: "/supervisor/vehicle-history",
      },
    ],
  },
  {
    label: "Vehicle Release",
    items: [
      {
        label: "Release Requests",
        icon: releaseRequestIcon,
        path: "/supervisor/release-requests",
      },
      {
        label: "Release Queue",
        icon: queueIcon,
        path: "/supervisor/release-queue",
      },
      {
        label: "Release Log",
        icon: releaseLogIcon,
        path: "/supervisor/release-log",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Field Updates",
        icon: fieldUpdateIcon,
        path: "/supervisor/field-updates",
      },
      {
        label: "Operation Scheduler",
        icon: operationSchedulerIcon,
        path: "/supervisor/operation-scheduler",
      },
    ],
  },
];

/* ------------------------------------------------------------------
   HELPERS
------------------------------------------------------------------ */

/** "santa cruz" / "Sta Cruz" → "Sta. Cruz". Unknown names are kept as typed. */
const canonicalArea = (raw: string | null): string | null => {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
  return AREA_ALIASES[key] ?? trimmed;
};

/**
 * ⚠️ ADDED: Derive area name from coordinates — para malaman kung saan
 * area ng Sector 3 napupunta ang isang pin. Falls back to "Unassigned"
 * kung labas sa boundary.
 */
const deriveAreaFromCoords = (lat: number, lng: number): string => {
  // Simple bounding box check for the 4 known areas
  // (in production, use actual barangay polygon data)
  const distance = (
    a: [number, number],
    b: [number, number]
  ): number => {
    const dLat = a[0] - b[0];
    const dLng = a[1] - b[1];
    return Math.sqrt(dLat * dLat + dLng * dLng);
  };

  let closest: { name: string; dist: number } | null = null;
  for (const [name, center] of Object.entries(AREA_CENTERS)) {
    const d = distance([lat, lng], center);
    if (!closest || d < closest.dist) {
      closest = { name, dist: d };
    }
  }

  // Kung ang closest area ay malayo (> 0.02 degrees ~ 2km), i-flag as unassigned
  if (closest && closest.dist < 0.02) {
    return closest.name;
  }
  return UNKNOWN_AREA;
};

/**
 * Green → yellow → red, scaled against the busiest area. The busiest area
 * is always red; everything else is placed relative to it. The legend bar in
 * the CSS uses the same hues.
 */
const densityColor = (count: number, max: number): string => {
  const ratio = max > 0 ? Math.min(1, count / max) : 0;
  const hue = Math.round(120 * (1 - ratio));
  return `hsl(${hue}, 100%, 42%)`;
};

/* ------------------------------------------------------------------
   HEAT ZONES
   Clamps are grouped into cells of ~150 m. Each cell becomes a circle
   that grows and turns from green to RED as clamps pile up there.
   HOT_COUNT clamps or more in one cell = full red, so one or two clamps
   never look like a hotspot on their own.
------------------------------------------------------------------ */
const HEAT_CELL_DEG = 0.0014; // ≈ 150 m in Manila
const HOT_COUNT = 5;

const HEAT_LEVELS = [
  { label: "1", min: 1, color: "#22c55e" },
  { label: "2", min: 2, color: "#eab308" },
  { label: "3–4", min: 3, color: "#f97316" },
  { label: `${HOT_COUNT}+`, min: HOT_COUNT, color: "#dc2626" },
];

const heatColor = (count: number): string => {
  let color = HEAT_LEVELS[0].color;
  for (const level of HEAT_LEVELS) if (count >= level.min) color = level.color;
  return color;
};

/** 45 m for a single clamp, growing to 140 m at HOT_COUNT and beyond. */
const heatRadius = (count: number): number =>
  Math.round(45 + (Math.min(count, HOT_COUNT * 2) / (HOT_COUNT * 2)) * 140);

/** Keys of a count map, most common first. */
const topKeys = (counts: Map<string, number>, n: number): string[] =>
  Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key]) => key);

/** "Oct 23, 9:00 AM" */
const formatWhen = (date: Date | null): string =>
  date
    ? date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";

const buildHeatZones = (points: ViolationPoint[]): HeatZone[] => {
  const cells = new Map<
    string,
    { lat: number; lng: number; count: number; places: Map<string, number>; types: Map<string, number>; latest: Date | null }
  >();
  points.forEach((point) => {
    const key = `${Math.round(point.lat / HEAT_CELL_DEG)}:${Math.round(point.lng / HEAT_CELL_DEG)}`;
    const cell = cells.get(key) ?? { lat: 0, lng: 0, count: 0, places: new Map(), types: new Map(), latest: null };
    cell.lat += point.lat;
    cell.lng += point.lng;
    cell.count += 1;
    const place = point.location?.trim();
    if (place) cell.places.set(place, (cell.places.get(place) ?? 0) + 1);
    const type = point.violationType?.trim() || UNKNOWN_TYPE;
    cell.types.set(type, (cell.types.get(type) ?? 0) + 1);
    if (point.recordedAt && (!cell.latest || point.recordedAt > cell.latest)) cell.latest = point.recordedAt;
    cells.set(key, cell);
  });
  return Array.from(cells.entries())
    .map(([key, cell]) => ({
      key,
      lat: cell.lat / cell.count,
      lng: cell.lng / cell.count,
      count: cell.count,
      color: heatColor(cell.count),
      radius: heatRadius(cell.count),
      places: topKeys(cell.places, 3),
      types: topKeys(cell.types, 3),
      latest: cell.latest,
    }))
    // Small zones first so the red ones are drawn on top.
    .sort((a, b) => a.count - b.count);
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Area names come from the database, so they are escaped before being
 *  injected into the marker's HTML. */
const pinIcon = (color: string, label: string, value: number) =>
  L.divIcon({
    className: "",
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-4px);">
        <div style="background:${color};color:white;font-size:11px;font-weight:700;padding:2px 8px;border-radius:9999px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.25);margin-bottom:2px;">
          ${escapeHtml(label)} · ${value}
        </div>
        <div style="width:14px;height:14px;background:${color};border:2px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

/**
 * ⚠️ ADDED: Location pin icon for individual violations (smaller than area pin)
 */
const violationPinIcon = (color: string) =>
  L.divIcon({
    className: "",
    html: `
      <div style="
        width:10px;height:10px;
        background:${color};
        border:2px solid white;
        border-radius:50%;
        box-shadow:0 1px 4px rgba(0,0,0,0.4);
      "></div>
    `,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });

/** Moves the map to where the clamps are (the red zones) when data loads. */
function FitToZones({ zones }: { zones: HeatZone[] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || zones.length === 0) return;
    fitted.current = true;
    const bounds = L.latLngBounds(zones.map((z) => [z.lat, z.lng] as [number, number]));
    map.fitBounds(bounds.pad(0.3), { maxZoom: 16, animate: false });
  }, [map, zones]);
  return null;
}

function InvalidateSizeOnMount() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

/**
 * Flies the map to the clicked area or zone, then opens its popup.
 * Popups are found through the refs the page keeps for each pin/zone.
 */
function FlyToFocus({
  focus,
  popups,
}: {
  focus: MapFocus | null;
  popups: RefObject<Map<string, L.Layer>>;
}) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    const open = () => {
      const layer = popups.current?.get(focus.target);
      if (layer) layer.openPopup();
    };
    map.closePopup();
    map.once("moveend", open);
    map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), focus.zoom), { duration: 0.8 });
    return () => {
      map.off("moveend", open);
    };
  }, [map, focus, popups]);
  return null;
}

const HOTSPOT_TONES = ["red", "yellow", "blue"] as const;

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function SupervisorGeospatialHeatmap() {
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "supervisor",
  });

  const [points, setPoints] = useState<ViolationPoint[]>([]);
  /** Clamps not placed by GPS: put at their recorded location, or left off. */
  const [placement, setPlacement] = useState({ offMap: 0, placedByLocation: 0 });
  const [loading, setLoading] = useState(true);

  /* Clickable map: where to fly, and the pin/zone layers whose popup to open. */
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [ring, setRing] = useState<MapFocus | null>(null);
  const popupLayers = useRef(new Map<string, L.Layer>());
  const mapWrapperRef = useRef<HTMLDivElement>(null);
  const flyCount = useRef(0);

  /* Current user */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) {
        setCurrentUser({ name: "Guest", role: "supervisor" });
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", loggedUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          setCurrentUser({
            name: data.name ?? "Unknown",
            role: (data.role ?? "supervisor") as RoleSlug,
          });
        }
      } catch (err) {
        console.error("Failed to load current user:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  /**
   * ⚠️ CHANGED: Kinuha na ang `locationCoords` (lat/lng) imbes na `barangay`
   * text field. Real location data na — kasama ang CIN, plate, at location
   * description para may context ang bawat pin.
   */
  useEffect(() => {
    const q = query(
      collection(db, "violations"),
      where("sectorId", "==", SECTOR_ID)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const fetched: ViolationPoint[] = [];
        let offMap = 0;
        let placedByLocation = 0;

        snap.docs.forEach((d) => {
          const data = d.data();

          // ⚠️ CHANGED: Basahin ang locationCoords (map) imbes na barangay
          const coords = data.locationCoords as
            | { lat: number; lng: number }
            | undefined;
          const gpsOk =
            !!coords &&
            typeof coords.lat === "number" &&
            typeof coords.lng === "number" &&
            insideMap(coords.lat, coords.lng);

          // GPS outside Sector 3 (or missing): use the recorded location.
          const known = data.location
            ? KNOWN_LOCATION_KEYS.get(locationKey(String(data.location)))
            : undefined;
          const position: [number, number] | null = gpsOk
            ? [coords!.lat, coords!.lng]
            : known ?? null;

          if (!position) {
            offMap++;
            return;
          }
          if (!gpsOk) placedByLocation++;

          fetched.push({
            lat: position[0],
            lng: position[1],
            barangay: (data.barangay as string) ?? null,
            violationType: (data.violationType as string) ?? null,
            cin: (data.cin as string) ?? null,
            plateNo: (data.plateNo as string) ?? null,
            location: (data.location as string) ?? null,
            recordedAt:
              typeof data.recordedAt?.toDate === "function"
                ? (data.recordedAt.toDate() as Date)
                : null,
          });
        });

        setPoints(fetched);
        setPlacement({ offMap, placedByLocation });
        setLoading(false);
      },
      (err) => {
        console.warn("Heatmap fetch failed:", err.code);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  /** Supervisors see the same pages as the OIC, minus Payment/Finance. */
  const navGroups = useMemo(
    () =>
      NAV_GROUPS.filter(
        (group) =>
          !(currentUser.role === "supervisor" && group.label === "Payment/Finance")
      ),
    [currentUser.role]
  );

  /**
   * ⚠️ CHANGED: Nag-group na base sa canonical area (derived from coords
   * kung walang barangay text). Mas accurate na ang area assignment.
   */
  const { areas, unassigned } = useMemo(() => {
    const groups = new Map<
      string,
      {
        count: number;
        types: Map<string, number>;
        places: Map<string, number>;
        lat: number;
        lng: number;
        latest: Date | null;
      }
    >();
    let missing = 0;

    points.forEach((point) => {
      // ⚠️ CHANGED: Canonical area — gamitin ang barangay text kung meron,
      // otherwise derive mula sa coordinates
      const rawArea =
        canonicalArea(point.barangay) ??
        deriveAreaFromCoords(point.lat, point.lng);

      if (!rawArea || rawArea === UNKNOWN_AREA) {
        missing++;
        return;
      }

      const group = groups.get(rawArea) ?? {
        count: 0,
        types: new Map(),
        places: new Map(),
        lat: 0,
        lng: 0,
        latest: null,
      };
      group.count++;
      group.lat += point.lat;
      group.lng += point.lng;
      const type = point.violationType?.trim() || UNKNOWN_TYPE;
      group.types.set(type, (group.types.get(type) ?? 0) + 1);
      const place = point.location?.trim();
      if (place) group.places.set(place, (group.places.get(place) ?? 0) + 1);
      if (point.recordedAt && (!group.latest || point.recordedAt > group.latest)) {
        group.latest = point.recordedAt;
      }
      groups.set(rawArea, group);
    });

    const max = Math.max(1, ...Array.from(groups.values()).map((g) => g.count));

    const stats: AreaStat[] = Array.from(groups.entries())
      .map(([name, group]) => {
        const topType =
          Array.from(group.types.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
          UNKNOWN_TYPE;
        return {
          name,
          count: group.count,
          topType,
          color: densityColor(group.count, max),
          center: AREA_CENTERS[name] ?? [group.lat / group.count, group.lng / group.count],
          places: topKeys(group.places, 3),
          latest: group.latest,
        };
      })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    return { areas: stats, unassigned: missing };
  }, [points]);

  const heatZones = useMemo(() => buildHeatZones(points), [points]);
  const hotZoneCount = heatZones.filter((z) => z.count >= HOT_COUNT).length;

  const densityTiles = areas.slice(0, 4);
  const hotspots = areas.slice(0, 3);
  const pinnedAreas = areas;

  /** This role's Clamping Log (OIC: /dashboard/clamping, Supervisor: /supervisor/clamping). */
  const clampingLogPath =
    NAV_GROUPS.flatMap((group) => group.items).find((item) => item.label === "Clamping Log")?.path ??
    "/dashboard/clamping";

  /** Keeps a pin's or zone's layer so its popup can be opened from the lists. */
  const keepLayer = (target: string) => (layer: L.Layer | null) => {
    if (layer) popupLayers.current.set(target, layer);
    else popupLayers.current.delete(target);
  };

  /** Fly to an area or zone, highlight it, and open its popup. */
  const flyTo = (target: string, lat: number, lng: number, zoom: number) => {
    const next = { target, lat, lng, zoom, stamp: (flyCount.current += 1) };
    setFocus(next);
    setRing(next);
    const box = mapWrapperRef.current?.getBoundingClientRect();
    if (box && (box.top < 0 || box.bottom > window.innerHeight)) {
      mapWrapperRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const showArea = (area: AreaStat) => flyTo(`area:${area.name}`, area.center[0], area.center[1], 16);

  /* The blue highlight ring fades after a few seconds. */
  useEffect(() => {
    if (!ring) return;
    const timer = setTimeout(() => setRing(null), 3200);
    return () => clearTimeout(timer);
  }, [ring]);

  return (
    <div className="oic-page geo-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <AppSidebar groups={navGroups} role={<>{ROLE_LABELS[currentUser.role]}</>} />

        {/* MAIN */}
        <div className="main">
          <AppTopbar groups={navGroups} />
          <header className="main-header">
            <div>
              <h1>Geospatial Heatmap</h1>
              <p>
                {new Date().toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>

          </header>

          <main className="main-content">
            {/* MAP */}
            <div className="geo-map-wrapper" ref={mapWrapperRef}>
              <MapContainer
                center={MANILA_D3_CENTER}
                zoom={15}
                minZoom={14}
                maxZoom={18}
                maxBounds={MAX_BOUNDS}
                maxBoundsViscosity={1.0}
                scrollWheelZoom={false}
                zoomControl={false}
                style={{ height: "100%", width: "100%" }}
              >
                <InvalidateSizeOnMount />
                <FitToZones zones={heatZones} />
                <FlyToFocus focus={focus} popups={popupLayers} />
                <ZoomControl position="topright" />
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Dims everything outside Sector 3 */}
                <Polygon
                  positions={[OUTER_MASK, [...DISTRICT_3_BOUNDARY].reverse()]}
                  pathOptions={{
                    stroke: false,
                    fillColor: "#0f172a",
                    fillOpacity: 0.55,
                  }}
                  interactive={false}
                />

                <Polygon
                  positions={DISTRICT_3_BOUNDARY}
                  pathOptions={{ color: "#2547d0", weight: 3, fillOpacity: 0 }}
                />

                {/* HEAT ZONES — red where many clamps are in the same spot */}
                {heatZones.map((zone) => (
                  <Circle
                    key={`glow-${zone.key}`}
                    center={[zone.lat, zone.lng]}
                    radius={zone.radius * 1.6}
                    pathOptions={{
                      stroke: false,
                      fillColor: zone.color,
                      fillOpacity: 0.18,
                    }}
                    interactive={false}
                  />
                ))}
                {heatZones.map((zone) => (
                  <Circle
                    key={`zone-${zone.key}`}
                    center={[zone.lat, zone.lng]}
                    radius={zone.radius}
                    pathOptions={{
                      color: zone.color,
                      weight: 1,
                      fillColor: zone.color,
                      fillOpacity: zone.count >= HOT_COUNT ? 0.55 : 0.4,
                    }}
                    ref={keepLayer(`zone:${zone.key}`)}
                    eventHandlers={{
                      click: () => flyTo(`zone:${zone.key}`, zone.lat, zone.lng, 17),
                    }}
                  >
                    <Tooltip direction="top" sticky>
                      <strong>
                        {zone.count} clamp{zone.count === 1 ? "" : "s"}
                      </strong>
                      {zone.count >= HOT_COUNT ? " · hotspot" : ""}
                      {zone.places.length > 0 && (
                        <>
                          <br />
                          {zone.places.join(" · ")}
                        </>
                      )}
                      <br />
                      <span className="geo-tooltip-hint">Click for details</span>
                    </Tooltip>
                    <Popup>
                      <div className="map-popup">
                        <div className="map-popup-title">
                          {zone.count} clamp{zone.count === 1 ? "" : "s"} in this spot
                          {zone.count >= HOT_COUNT && <span className="map-popup-hot">Hotspot</span>}
                        </div>
                        {zone.places.length > 0 && (
                          <div>
                            <strong>Where:</strong> {zone.places.join(" · ")}
                          </div>
                        )}
                        <div>
                          <strong>Violations:</strong> {zone.types.join(", ")}
                        </div>
                        <div className="map-popup-muted">
                          Latest: {formatWhen(zone.latest)}
                        </div>
                        <button
                          type="button"
                          className="map-popup-link"
                          onClick={() => navigate(clampingLogPath)}
                        >
                          <ListFilter size={14} aria-hidden="true" />
                          Open Clamping Log
                        </button>
                      </div>
                    </Popup>
                  </Circle>
                ))}

                {/* Each clamp as a small dot (click for details) */}
                {points.map((point, idx) => (
                  <Marker
                    key={`violation-${idx}-${point.cin ?? idx}`}
                    position={[point.lat, point.lng]}
                    icon={violationPinIcon("#1f2937")}
                  >
                    <Popup>
                      <div className="map-popup">
                        <div className="map-popup-title">
                          {point.cin ?? "Unknown CIN"}
                        </div>
                        {point.plateNo && (
                          <div>
                            <strong>Plate:</strong> {point.plateNo}
                          </div>
                        )}
                        <div>
                          <strong>Type:</strong>{" "}
                          {point.violationType ?? UNKNOWN_TYPE}
                        </div>
                        {point.location && (
                          <div className="map-popup-muted">
                            {point.location}
                          </div>
                        )}
                        <div className="map-popup-muted">
                          📍 {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}

                {/* Area pins (aggregated) */}
                {pinnedAreas.map((area) => (
                  <Marker
                    key={area.name}
                    position={area.center}
                    icon={pinIcon(area.color, area.name, area.count)}
                    ref={keepLayer(`area:${area.name}`)}
                    eventHandlers={{
                      click: () => flyTo(`area:${area.name}`, area.center[0], area.center[1], 16),
                    }}
                  >
                    <Popup>
                      <div className="map-popup">
                        <div className="map-popup-title">{area.name}</div>
                        <div>
                          <strong>
                            {area.count} violation{area.count === 1 ? "" : "s"}
                          </strong>
                        </div>
                        <div>
                          <strong>Top type:</strong> {area.topType}
                        </div>
                        {area.places.length > 0 && (
                          <div>
                            <strong>Busiest streets:</strong> {area.places.join(" · ")}
                          </div>
                        )}
                        <div className="map-popup-muted">
                          Latest: {formatWhen(area.latest)}
                        </div>
                        <button
                          type="button"
                          className="map-popup-link"
                          onClick={() => navigate(clampingLogPath)}
                        >
                          <ListFilter size={14} aria-hidden="true" />
                          Open Clamping Log
                        </button>
                      </div>
                    </Popup>
                  </Marker>
                ))}
                {ring && (
                  <Circle
                    key={`ring-${ring.stamp}`}
                    center={[ring.lat, ring.lng]}
                    radius={ring.zoom >= 17 ? 120 : 260}
                    pathOptions={{
                      color: "#1D4ED8",
                      weight: 3,
                      fill: false,
                      className: "geo-focus-ring",
                    }}
                    interactive={false}
                  />
                )}
              </MapContainer>

              <div className="heat-legend" aria-label="Clamp density legend">
                <div className="heat-legend-title">Clamps in one spot (~150 m)</div>
                <div className="heat-legend-row">
                  {HEAT_LEVELS.map((level) => (
                    <span key={level.label} className="heat-legend-item">
                      <span className="heat-legend-dot" style={{ background: level.color }} />
                      {level.label}
                    </span>
                  ))}
                </div>
                <div className="heat-legend-note">
                  {hotZoneCount > 0
                    ? `${hotZoneCount} hotspot${hotZoneCount === 1 ? "" : "s"} (red)`
                    : `Red = ${HOT_COUNT}+ clamps in the same spot`}
                </div>
              </div>
            </div>

            <div className="geo-split">
              {/* DENSITY */}
              <div className="card geo-card">
                <h2 className="card-title">Highest violation density</h2>
                {densityTiles.length > 0 && (
                  <p className="geo-click-hint">
                    <MousePointerClick size={14} aria-hidden="true" />
                    Click an area to see it on the map
                  </p>
                )}

                {loading ? (
                  <div className="geo-empty">
                    <p>Loading Sector 3 data...</p>
                  </div>
                ) : densityTiles.length === 0 ? (
                  <div className="geo-empty">
                    <p>
                      No Sector 3 violations with location data recorded yet.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="density-grid">
                      {densityTiles.map((area) => (
                        <button
                          type="button"
                          key={area.name}
                          className="density-tile density-tile-btn"
                          style={{ backgroundColor: area.color }}
                          onClick={() => showArea(area)}
                          aria-label={`${area.name}: ${area.count} violations. Show on map`}
                        >
                          <span className="density-tile-name">{area.name}</span>
                          <span className="density-tile-value">{area.count}</span>
                          <LocateFixed size={16} className="density-tile-go" aria-hidden="true" />
                        </button>
                      ))}
                    </div>

                    <div className="density-scale">
                      <span>Low</span>
                      <div className="density-scale-bar" />
                      <span>High</span>
                    </div>
                  </>
                )}

                {placement.placedByLocation > 0 && (
                  <p className="geo-note">
                    {placement.placedByLocation} clamp
                    {placement.placedByLocation === 1 ? "" : "s"} had GPS outside Sector 3
                    and {placement.placedByLocation === 1 ? "is" : "are"} shown at the
                    recorded location instead.
                  </p>
                )}
                {placement.offMap > 0 && (
                  <p className="geo-note">
                    {placement.offMap} clamp{placement.offMap === 1 ? "" : "s"} could not be
                    placed on the map (GPS outside Sector 3 and an unknown location).
                  </p>
                )}
                {unassigned > 0 && (
                  <p className="geo-note">
                    {unassigned} Sector 3 violation
                    {unassigned === 1 ? "" : "s"}{" "}
                    {unassigned === 1 ? "has" : "have"} no location inside a
                    known area and {unassigned === 1 ? "is" : "are"} not counted.
                  </p>
                )}
              </div>

              {/* HOTSPOTS */}
              <div className="card geo-card">
                <h2 className="card-title">Top Hotspot Locations</h2>

                {loading ? (
                  <div className="geo-empty">
                    <p>Loading Sector 3 data...</p>
                  </div>
                ) : hotspots.length === 0 ? (
                  <div className="geo-empty">
                    <p>No hotspots to show yet.</p>
                  </div>
                ) : (
                  <div className="hotspot-list">
                    {hotspots.map((hotspot, index) => (
                      <button
                        type="button"
                        key={hotspot.name}
                        className="hotspot-item hotspot-item-btn"
                        onClick={() => showArea(hotspot)}
                        aria-label={`${hotspot.name}: ${hotspot.count} violations. Show on map`}
                      >
                        <span
                          className={`hotspot-pill hotspot-pill-${HOTSPOT_TONES[index]}`}
                        >
                          {hotspot.count} violation
                          {hotspot.count === 1 ? "" : "s"}
                        </span>
                        <span className="hotspot-text">
                          <span className="hotspot-location">{hotspot.name}</span>
                          <span className="hotspot-type">
                            Top type: {hotspot.topType}
                          </span>
                        </span>
                        <LocateFixed size={16} className="hotspot-go" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
