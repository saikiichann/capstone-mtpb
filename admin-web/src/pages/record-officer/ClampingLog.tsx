import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  KeyRound,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import ChangePasswordModal from "../../components/ChangePasswordModal";
import "./ClampingLog.css";
import {
  CLAMP_OVERDUE_FEE,
  amountDueFor,
  graceHoursLeft,
  isClampOverdue,
} from "../../lib/clampFee";

// Asset imports
import mtpbLogo from "../../assets/mtpb-logo.png";
import officerAvatar from "../../assets/user.png";
import overviewIcon from "../../assets/overview.png";
import allViolationsIcon from "../../assets/allviolations.png";
import clampingIcon from "../../assets/clamping.png";
import impoundingLogIcon from "../../assets/impounding.png";
import releaseLogIcon from "../../assets/releaselog.png";
import allReportsIcon from "../../assets/reports.png";
import exportCenterIcon from "../../assets/export.png";
import logoutIcon from "../../assets/logout.png";

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------
type RoleSlug =
  | "oic"
  | "it-admin"
  | "supervisor"
  | "record-officer"
  | "release-officer"
  | "finance"
  | "clamping-staff"
  | "impounding-staff";

type CurrentUser = {
  name: string;
  role: RoleSlug;
};

type ClampStatus = "Clamped" | "Released";

type ClampingRow = {
  id: string;
  reference: string | null;
  cin: string;
  plateNo: string;
  violation: string;
  location: string;
  officer: string;
  recordedAt: Timestamp | null;
  status: ClampStatus;
  /** True once "Subject to Impound" has been set (auto or manual). */
  alreadyFlagged: boolean;
  /** True kapag auto-flagged ng system (24hr expired). */
  autoFlagged: boolean;
  /** The impound status field from Firestore. */
  impoundStatus: string | null;
  /** Hours since clamping. */
  hoursSinceClamp: number;
  /** What the owner pays now: ₱900, or ₱2,000 past 24 hours (lib/clampFee.ts) */
  amountDue: number;
  /** Past 24 hours and not yet paid */
  overdue: boolean;
  /** Payment recorded (pending verification or verified) */
  paid: boolean;
  /** Hours left in the 24-hour grace period */
  graceLeft: number;
};

type NavItem = {
  label: string;
  icon: string;
  path: string;
  active?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------
const ITEMS_PER_PAGE = 10;
const ALL_VIOLATIONS = "All Violations";

const MASTER_VIOLATIONS = [
  "Illegal Parking",
  "No Parking Zone",
  "Obstruction",
  "Sidewalk Parking",
  "Street Corner Parking",
  "Left Side Parking",
  "Right Side Parking",
  "Top of the Bridge Parking",
  "Loading & Unloading Area",
  "Blocking Driveway",
  "Blocking PWD Lane",
  "Blocking Fire Hydrant",
  "Complaint Area",
  "Blocking Pedestrian Lane",
  "Blocking Fire Truck Lane",
  "Double Parking",
];

const ROLE_LABELS: Record<RoleSlug, string> = {
  "oic": "Officer in Charge",
  "it-admin": "IT Admin",
  "supervisor": "Supervisor",
  "record-officer": "Record Officer",
  "release-officer": "Release Officer",
  "finance": "Finance Staff",
  "clamping-staff": "Clamping Staff",
  "impounding-staff": "Impounding Staff",
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Dashboard",
    items: [
      { label: "Overview", icon: overviewIcon, path: "/record-officer" },
    ],
  },
  {
    label: "Enforcement",
    items: [
      {
        label: "All Violations",
        icon: allViolationsIcon,
        path: "/record-officer/violations",
      },
      {
        label: "Clamping Log",
        icon: clampingIcon,
        path: "/record-officer/clamping",
        active: true,
      },
      {
        label: "Impounding Log",
        icon: impoundingLogIcon,
        path: "/record-officer/impounding",
      },
    ],
  },
  {
    label: "Vehicle Release",
    items: [
      {
        label: "Release Log",
        icon: releaseLogIcon,
        path: "/record-officer/release-log",
      },
    ],
  },
  {
    label: "Reports",
    items: [
      { label: "All Reports", icon: allReportsIcon, path: "/record-officer/reports" },
      { label: "Export Center", icon: exportCenterIcon, path: "/record-officer/export" },
    ],
  },
];

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
const formatDateTime = (ts: Timestamp | null): string => {
  if (!ts) return "—";
  try {
    const date = ts.toDate();
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

const millis = (ts: Timestamp | null): number => {
  try {
    return ts ? ts.toMillis() : 0;
  } catch {
    return 0;
  }
};

/**
 * Computes hours elapsed since the vehicle was clamped.
 */
const computeHoursSinceClamp = (ts: Timestamp | null): number => {
  if (!ts) return 0;
  try {
    return (Date.now() - ts.toDate().getTime()) / (1000 * 60 * 60);
  } catch {
    return 0;
  }
};

const normalizeViolationType = (raw: unknown): string => {
  if (typeof raw !== "string") return "—";
  const trimmed = raw.trim();
  if (!trimmed) return "—";

  const knownMap: Record<string, string> = {
    "illegal parking": "Illegal Parking",
    "no parking zone": "No Parking Zone",
    obstruction: "Obstruction",
    "sidewalk parking": "Sidewalk Parking",
    "street corner parking": "Street Corner Parking",
    "left side parking": "Left Side Parking",
    "right side parking": "Right Side Parking",
    "top of the bridge parking": "Top of the Bridge Parking",
    "loading & unloading area": "Loading & Unloading Area",
    "blocking driveway": "Blocking Driveway",
    "blocking pwd lane": "Blocking PWD Lane",
    "blocking fire hydrant": "Blocking Fire Hydrant",
    "complaint area": "Complaint Area",
    "blocking pedestrian lane": "Blocking Pedestrian Lane",
    "blocking fire truck lane": "Blocking Fire Truck Lane",
    "double parking": "Double Parking",
  };

  const key = trimmed.toLowerCase();
  if (key in knownMap) return knownMap[key];

  return trimmed
    .split(" ")
    .map((word) => {
      if (!word) return word;
      if (word === word.toUpperCase() && word.length <= 4) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
};

const deriveStatus = (releaseStatus: unknown): ClampStatus =>
  releaseStatus === "Released" ? "Released" : "Clamped";

const getStatusClass = (status: ClampStatus): string =>
  status === "Released" ? "status-released-clamp" : "status-active-clamp";

/**
 * The fee as it stands: ₱900 within 24 hours, a fixed ₱2,000 after
 * (lib/clampFee.ts). A clamp stays clamped — it is not sent to impound.
 */
function FeeCell({ row }: { row: ClampingRow }) {
  if (row.status === "Released") {
    return <span className="action-placeholder">—</span>;
  }
  if (row.paid) {
    return (
      <span className="badge-impounded" title="Payment recorded">
        Paid · ₱{row.amountDue.toLocaleString()}
      </span>
    );
  }
  if (row.overdue) {
    return (
      <span
        className="badge-grace-ended"
        title="Past the 24-hour grace period: the fee is now a fixed ₱2,000 (replaces the fine). The vehicle stays clamped."
      >
        Overdue · ₱{CLAMP_OVERDUE_FEE.toLocaleString()}
      </span>
    );
  }
  return (
    <span className="impound-pending" title="Within the 24-hour grace period">
      ₱{row.amountDue.toLocaleString()} · {Math.max(1, Math.ceil(row.graceLeft))}h left
    </span>
  );
}

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------
export default function ClampingLog() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "record-officer",
  });

  const [rows, setRows] = useState<ClampingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [violationFilter, setViolationFilter] = useState(ALL_VIOLATIONS);
  const [currentPage, setCurrentPage] = useState(1);

  // -----------------------------------------------------------------------
  // EFFECT: Fetch current user
  // -----------------------------------------------------------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) {
        setCurrentUser({ name: "Guest", role: "record-officer" });
        return;
      }
      try {
        const userDocRef = doc(db, "users", loggedUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          setCurrentUser({
            name: data.name ?? "Unknown",
            role: (data.role ?? "record-officer") as RoleSlug,
          });
        } else {
          setCurrentUser({
            name: loggedUser.email?.split("@")[0] ?? "Unknown",
            role: "record-officer",
          });
        }
      } catch (err) {
        console.error("Error fetching current user:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  // -----------------------------------------------------------------------
  // EFFECT: Fetch clamping records
  // -----------------------------------------------------------------------
  useEffect(() => {
    const q = query(
      collection(db, "violations"),
      where("enforcementType", "==", "clamped")
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const fetched: ClampingRow[] = snap.docs
          .map((d) => {
            const data = d.data();
            const recordedAt = (data.recordedAt as Timestamp) ?? null;
            const hoursSinceClamp = computeHoursSinceClamp(recordedAt);

            return {
              id: d.id,
              reference:
                (data.referenceNumber as string) ??
                (data.paymentReference as string) ??
                null,
              cin: data.cin ?? "—",
              plateNo: data.plateNo ?? "—",
              violation: normalizeViolationType(data.violationType),
              location: data.location ?? "—",
              officer: data.officer ?? "—",
              recordedAt,
              status: deriveStatus(data.releaseStatus),
              alreadyFlagged: data.impoundStatus === "Subject to Impound",
              autoFlagged: data.impoundAutoFlagged ?? false,
              impoundStatus: data.impoundStatus ?? null,
              hoursSinceClamp,
              amountDue: amountDueFor(data),
              overdue: isClampOverdue(data),
              paid: ["verified", "pending verification"].includes(
                String(data.paymentStatus ?? "").toLowerCase()
              ),
              graceLeft: graceHoursLeft(data),
            };
          })
          .sort((a, b) => millis(b.recordedAt) - millis(a.recordedAt));

        setRows(fetched);
        setLoading(false);
      },
      (err) => {
        console.warn("Clamping log fetch failed:", err.code);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Clamps are not sent to impound: past 24 hours an unpaid clamp stays
  // clamped and is charged a fixed ₱2,000 (lib/clampFee.ts). The Fee
  // column shows where each clamp stands.

  // -----------------------------------------------------------------------
  // EFFECT: Click-outside for dropdown
  // -----------------------------------------------------------------------
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // -----------------------------------------------------------------------
  // HANDLERS
  // -----------------------------------------------------------------------
  const handleLogout = async () => {
    try {
      await firebaseSignOut(auth);
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      sessionStorage.clear();
      setIsMenuOpen(false);
      navigate("/");
    } catch (err) {
      console.error("Logout error:", err);
      setIsMenuOpen(false);
      navigate("/");
    }
  };

  const handleChangePassword = () => {
    setIsMenuOpen(false);
    setShowChangePassword(true);
  };

  const violationOptions = useMemo(() => {
    const unique = new Set<string>(MASTER_VIOLATIONS);
    rows.forEach((row) => {
      if (row.violation && row.violation !== "—") unique.add(row.violation);
    });
    return [ALL_VIOLATIONS, ...Array.from(unique).sort()];
  }, [rows]);

  /* Search + filter */
  const filteredRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return rows.filter((row) => {
      const matchesSearch =
        !q ||
        row.cin.toLowerCase().includes(q) ||
        row.plateNo.toLowerCase().includes(q) ||
        row.location.toLowerCase().includes(q) ||
        row.violation.toLowerCase().includes(q);
      const matchesViolation =
        violationFilter === ALL_VIOLATIONS || row.violation === violationFilter;
      return matchesSearch && matchesViolation;
    });
  }, [rows, searchQuery, violationFilter]);

  const activeClamps = useMemo(
    () => rows.filter((r) => r.status === "Clamped").length,
    [rows]
  );

  /* Pagination */
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = filteredRows.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, violationFilter]);

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------
  return (
    <div className="record-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <img src={mtpbLogo} alt="MTPB Logo" className="sidebar-logo-img" />
            <div>
              <p className="sidebar-brand-name">MTPB</p>
              <p className="sidebar-brand-role">Record Officer</p>
            </div>
          </div>

          <nav className="sidebar-nav">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="nav-group">
                <p className="nav-group-label">{group.label}</p>
                <ul className="nav-list">
                  {group.items.map((item) => (
                    <li key={item.label}>
                      <button
                        type="button"
                        className={`nav-item ${item.active ? "nav-item-active" : ""}`}
                        onClick={() => navigate(item.path)}
                      >
                        <img src={item.icon} alt="" className="nav-icon" />
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* MAIN CONTENT */}
        <div className="main">
          <header className="main-header">
            <div>
              <h1>Clamping Log</h1>
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
                src={officerAvatar}
                alt="Officer Profile"
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
                  <button className="dropdown-item" onClick={handleChangePassword}>
                    <KeyRound size={18} />
                    <span>Change Password</span>
                  </button>
                  <button className="dropdown-item logout" onClick={handleLogout}>
                    <img src={logoutIcon} alt="" className="dropdown-icon" />
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </div>
          </header>

          <main className="main-content">
            {/* SEARCH + FILTER */}
            <div className="search-filter-row">
              <div className="search-bar-container">
                <Search size={18} className="search-bar-icon" />
                <input
                  type="text"
                  className="search-bar-input"
                  placeholder="Search CIN, Plate No..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="filter-select-wrap">
                <select
                  className="filter-select"
                  value={violationFilter}
                  onChange={(e) => setViolationFilter(e.target.value)}
                  aria-label="Filter by violation"
                >
                  {violationOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <ChevronDown size={18} className="filter-select-icon" />
              </div>
            </div>

            <div className="card">
              <div className="log-header">
                <p className="card-eyebrow">Sector 3</p>
                <div className="log-header-meta">
                  Active clamps: {activeClamps} total
                </div>
              </div>
              <h2 className="card-title" style={{ marginBottom: 16 }}>
                Clamping Log
              </h2>

              {loading ? (
                <div className="table-loading">
                  <p>Loading clamping log...</p>
                </div>
              ) : paginatedRows.length === 0 ? (
                <div className="table-empty">
                  <p>
                    {rows.length === 0
                      ? "No clamping records found."
                      : "No records match your search or filter."}
                  </p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Reference</th>
                        <th>CIN</th>
                        <th>Plate No.</th>
                        <th>Violation</th>
                        <th>Location</th>
                        <th>Clamped by</th>
                        <th>Time</th>
                        <th>Status</th>
                        <th>Fee</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRows.map((row) => (
                        <tr key={row.id}>
                          <td className="cell-reference">
                            {row.reference ?? "—"}
                          </td>
                          <td>
                            <span className="cin-pill">{row.cin}</span>
                          </td>
                          <td className="cell-plate">{row.plateNo}</td>
                          <td className="cell-violation">{row.violation}</td>
                          <td className="cell-location">{row.location}</td>
                          <td className="cell-clamped-by">{row.officer}</td>
                          <td className="cell-datetime">
                            {formatDateTime(row.recordedAt)}
                          </td>
                          <td>
                            <span
                              className={`status-pill ${getStatusClass(
                                row.status
                              )}`}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td>
                            <FeeCell row={row} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* PAGINATION */}
              {!loading && paginatedRows.length > 0 && (
                <div className="pagination">
                  <button
                    type="button"
                    className="pagination-btn"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                  >
                    <ChevronLeft size={16} />
                    Previous
                  </button>

                  <div className="pagination-info">
                    <span className="pagination-page">{safePage}</span>
                    <span className="pagination-sep">of {totalPages} pages</span>
                  </div>

                  <button
                    type="button"
                    className="pagination-btn"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={safePage === totalPages}
                  >
                    Next
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </div>
  );
}
