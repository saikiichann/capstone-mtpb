import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";
import {
  MapContainer,
  TileLayer,
  Polygon,
  Marker,
  Popup,
  ZoomControl,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
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

import logo from "../../assets/mtpb-logo.png";
import avatarImg from "../../assets/user.png";
import logoutIcon from "../../assets/logout.png";

import overviewIcon from "../../assets/overview.png";
import sectorAnalyticsIcon from "../../assets/sectoranalytics.png";
import mapIcon from "../../assets/map.png";
import clampingIcon from "../../assets/clamping.png";
import impoundingIcon from "../../assets/impounding.png";
import historyIcon from "../../assets/history.png";
import pendingPaymentsIcon from "../../assets/pendingpayments.png";
import paymentVerificationIcon from "../../assets/paymentverification.png";
import transactionIcon from "../../assets/transaction.png";
import revenueIcon from "../../assets/revenue.png";
import releaseRequestIcon from "../../assets/releaserequest.png";
import queueIcon from "../../assets/queue.png";
import releaseLogIcon from "../../assets/releaselog.png";
import clampingTeamsIcon from "../../assets/clampingteams.png";
import towTruckIcon from "../../assets/tow-truck.png";
import fieldUpdateIcon from "../../assets/fieldupdate.png";
import operationSchedulerIcon from "../../assets/scheduler.png";

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

/** Only the fields the heatmap needs from each violation. */
type ViolationPoint = {
  barangay: string | null;
  violationType: string | null;
};

type AreaStat = {
  name: string;
  count: number;
  topType: string;
  color: string;
  center: [number, number] | null;
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

/** Map pin positions for the Sector 3 areas. Areas not listed here still
 *  appear in the lists, just without a pin. */
const AREA_CENTERS: Record<string, [number, number]> = {
  "San Nicolas": [14.6057, 120.9698],
  "Sta. Cruz": [14.6091, 120.9822],
  Binondo: [14.6019, 120.9721],
  Quiapo: [14.5996, 120.9842],
};

/** Different spellings of the same area collapse to one name. */
const AREA_ALIASES: Record<string, string> = {
  "san nicolas": "San Nicolas",
  "sta cruz": "Sta. Cruz",
  "santa cruz": "Sta. Cruz",
  binondo: "Binondo",
  quiapo: "Quiapo",
};

const MANILA_D3_CENTER: [number, number] = [14.604, 120.978];

const DISTRICT_3_BOUNDARY: [number, number][] = [
  [14.6115, 120.966],
  [14.6115, 120.9865],
  [14.5975, 120.9865],
  [14.5975, 120.966],
];

const OUTER_MASK: [number, number][] = [
  [14.5, 120.9],
  [14.5, 121.05],
  [14.7, 121.05],
  [14.7, 120.9],
];

const MAX_BOUNDS: [[number, number], [number, number]] = [
  [14.59, 120.958],
  [14.618, 120.994],
];

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Dashboard",
    items: [
      { label: "Overview", icon: overviewIcon, path: "/dashboard" },
      {
        label: "Sector Analytics",
        icon: sectorAnalyticsIcon,
        path: "/dashboard/sector-analytics",
      },
      {
        label: "Geospatial Heatmap",
        icon: mapIcon,
        path: "/dashboard/heatmap",
        active: true,
      },
    ],
  },
  {
    label: "Enforcement",
    items: [
      { label: "Clamping Log", icon: clampingIcon, path: "/dashboard/clamping" },
      {
        label: "Impounding Log",
        icon: impoundingIcon,
        path: "/dashboard/impounding",
      },
      {
        label: "Vehicle History",
        icon: historyIcon,
        path: "/dashboard/vehicle-history",
      },
    ],
  },
  {
    label: "Payment/Finance",
    items: [
      {
        label: "Pending Payments",
        icon: pendingPaymentsIcon,
        path: "/dashboard/pending-payments",
      },
      {
        label: "Payment Verification",
        icon: paymentVerificationIcon,
        path: "/dashboard/verification",
      },
      {
        label: "Transaction History",
        icon: transactionIcon,
        path: "/dashboard/transactions",
      },
      { label: "Revenue Reports", icon: revenueIcon, path: "/dashboard/revenue" },
    ],
  },
  {
    label: "Vehicle Release",
    items: [
      {
        label: "Release Requests",
        icon: releaseRequestIcon,
        path: "/dashboard/release-requests",
      },
      {
        label: "Release Queue",
        icon: queueIcon,
        path: "/dashboard/release-queue",
      },
      {
        label: "Release Log",
        icon: releaseLogIcon,
        path: "/dashboard/release-log",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Active Clamping Teams",
        icon: clampingTeamsIcon,
        path: "/dashboard/clamping-teams",
      },
      {
        label: "Active Impounding",
        icon: towTruckIcon,
        path: "/dashboard/active-impounding",
      },
      {
        label: "Field Updates",
        icon: fieldUpdateIcon,
        path: "/dashboard/field-updates",
      },
      {
        label: "Operation Scheduler",
        icon: operationSchedulerIcon,
        path: "/dashboard/operation-scheduler",
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
 * Green → yellow → red, scaled against the busiest area. The busiest area
 * is always red; everything else is placed relative to it. The legend bar in
 * the CSS uses the same hues.
 */
const densityColor = (count: number, max: number): string => {
  const ratio = max > 0 ? Math.min(1, count / max) : 0;
  const hue = Math.round(120 * (1 - ratio));
  return `hsl(${hue}, 100%, 42%)`;
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

function InvalidateSizeOnMount() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

const HOTSPOT_TONES = ["red", "yellow", "blue"] as const;

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function GeospatialHeatmap() {
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "oic",
  });
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [points, setPoints] = useState<ViolationPoint[]>([]);
  const [loading, setLoading] = useState(true);

  /* Current user */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) {
        setCurrentUser({ name: "Guest", role: "oic" });
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", loggedUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          setCurrentUser({
            name: data.name ?? "Unknown",
            role: (data.role ?? "oic") as RoleSlug,
          });
        }
      } catch (err) {
        console.error("Failed to load current user:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  /**
   * Sector 3 violations only. A violation without `sectorId` is not part of
   * the heatmap at all, so the enforcer flow has to write it.
   */
  useEffect(() => {
    const q = query(
      collection(db, "violations"),
      where("sectorId", "==", SECTOR_ID)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setPoints(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              barangay: (data.barangay as string) ?? null,
              violationType: (data.violationType as string) ?? null,
            };
          })
        );
        setLoading(false);
      },
      (err) => {
        console.warn("Heatmap fetch failed:", err.code);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  /* Click outside */
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await firebaseSignOut(auth);
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      sessionStorage.clear();
      setIsMenuOpen(false);
      navigate("/", { replace: true });
    } catch (err) {
      console.error("Logout error:", err);
      setIsMenuOpen(false);
      navigate("/", { replace: true });
    }
  };

  /** Supervisors see the same pages as the OIC, minus Payment/Finance. */
  const navGroups = useMemo(
    () =>
      NAV_GROUPS.filter(
        (group) =>
          !(currentUser.role === "supervisor" && group.label === "Payment/Finance")
      ),
    [currentUser.role]
  );

  /* Group violations by area */
  const { areas, unassigned } = useMemo(() => {
    const groups = new Map<string, { count: number; types: Map<string, number> }>();
    let missing = 0;

    points.forEach((point) => {
      const name = canonicalArea(point.barangay);
      if (!name) {
        missing++;
        return;
      }
      const group = groups.get(name) ?? { count: 0, types: new Map() };
      group.count++;
      const type = point.violationType?.trim() || UNKNOWN_TYPE;
      group.types.set(type, (group.types.get(type) ?? 0) + 1);
      groups.set(name, group);
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
          center: AREA_CENTERS[name] ?? null,
        };
      })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    return { areas: stats, unassigned: missing };
  }, [points]);

  const densityTiles = areas.slice(0, 4);
  const hotspots = areas.slice(0, 3);
  const pinnedAreas = areas.filter((area) => area.center !== null);

  return (
    <div className="oic-page geo-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <img src={logo} alt="MTPB logo" className="sidebar-logo-img" />
            <div>
              <p className="sidebar-brand-name">MTPB</p>
              <p className="sidebar-brand-role">
                {ROLE_LABELS[currentUser.role]}
              </p>
            </div>
          </div>

          <nav className="sidebar-nav">
            {navGroups.map((group) => (
              <div key={group.label} className="nav-group">
                <p className="nav-group-label">{group.label}</p>
                <ul className="nav-list">
                  {group.items.map((item) => (
                    <li key={item.label}>
                      <button
                        type="button"
                        className={`nav-item ${
                          item.active ? "nav-item-active" : ""
                        }`}
                        onClick={() => navigate(item.path)}
                      >
                        <img src={item.icon} alt="" className="nav-icon" />
                        <span>{item.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* MAIN */}
        <div className="main">
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

            <div className="avatar-container" ref={dropdownRef}>
              <img
                src={avatarImg}
                alt="Account menu"
                className="avatar-img"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              />
              {isMenuOpen && (
                <div className="profile-dropdown">
                  <div className="dropdown-header">
                    <p className="dropdown-name">{currentUser.name}</p>
                    <p className="dropdown-role">
                      {ROLE_LABELS[currentUser.role]}
                    </p>
                  </div>
                  <button className="dropdown-item">
                    <KeyRound size={18} />
                    <span>Change Password</span>
                  </button>
                  <button
                    className="dropdown-item logout"
                    onClick={handleLogout}
                  >
                    <img src={logoutIcon} alt="" className="dropdown-icon" />
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </div>
          </header>

          <main className="main-content">
            {/* MAP */}
            <div className="geo-map-wrapper">
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

                {pinnedAreas.map((area) => (
                  <Marker
                    key={area.name}
                    position={area.center as [number, number]}
                    icon={pinIcon(area.color, area.name, area.count)}
                  >
                    <Popup>
                      <div className="map-popup">
                        <div className="map-popup-title">{area.name}</div>
                        <div>
                          {area.count} violation{area.count === 1 ? "" : "s"}
                        </div>
                        <div className="map-popup-muted">
                          Top type: {area.topType}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>

            <div className="geo-split">
              {/* DENSITY */}
              <div className="card geo-card">
                <h2 className="card-title">Highest violation density</h2>

                {loading ? (
                  <div className="geo-empty">
                    <p>Loading Sector 3 data...</p>
                  </div>
                ) : densityTiles.length === 0 ? (
                  <div className="geo-empty">
                    <p>No Sector 3 violations with a barangay recorded yet.</p>
                  </div>
                ) : (
                  <>
                    <div className="density-grid">
                      {densityTiles.map((area) => (
                        <div
                          key={area.name}
                          className="density-tile"
                          style={{ backgroundColor: area.color }}
                        >
                          <div className="density-tile-name">{area.name}</div>
                          <div className="density-tile-value">{area.count}</div>
                        </div>
                      ))}
                    </div>

                    <div className="density-scale">
                      <span>Low</span>
                      <div className="density-scale-bar" />
                      <span>High</span>
                    </div>
                  </>
                )}

                {unassigned > 0 && (
                  <p className="geo-note">
                    {unassigned} Sector 3 violation{unassigned === 1 ? "" : "s"}{" "}
                    {unassigned === 1 ? "has" : "have"} no barangay recorded and{" "}
                    {unassigned === 1 ? "is" : "are"} not counted.
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
                      <div key={hotspot.name} className="hotspot-item">
                        <span
                          className={`hotspot-pill hotspot-pill-${HOTSPOT_TONES[index]}`}
                        >
                          {hotspot.count} violation
                          {hotspot.count === 1 ? "" : "s"}
                        </span>
                        <div>
                          <div className="hotspot-location">{hotspot.name}</div>
                          <div className="hotspot-type">
                            Top type: {hotspot.topType}
                          </div>
                        </div>
                      </div>
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