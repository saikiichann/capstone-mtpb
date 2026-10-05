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
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./ImpoundingLog.css";

// Assets
import mtpbLogo from "../../assets/mtpb-logo.png";
import officerAvatar from "../../assets/user.png";
import overviewIcon from "../../assets/overview.png";
import impoundingLogIcon from "../../assets/impounding.png";
import activeImpoundingIcon from "../../assets/tow-truck.png";
import fieldUpdatesIcon from "../../assets/fieldupdate.png";
import logoutIcon from "../../assets/logout.png";

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

type CurrentUser = {
  name: string;
  role: RoleSlug;
};

type LogStatus = "Clamped" | "Impounded" | "Removed";

type ImpoundLogRow = {
  id: string;
  reference: string | null;
  cin: string;
  plateNo: string;
  violation: string;
  location: string;
  towedBy: string;
  timestamp: Timestamp | null;
  status: LogStatus;
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

/* ------------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------------ */
const ITEMS_PER_PAGE = 10;
const ALL_VIOLATIONS = "All Violations";

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

const navGroups: NavGroup[] = [
  {
    label: "Dashboard",
    items: [
      { label: "Overview", icon: overviewIcon, path: "/impounding-staff" },
    ],
  },
  {
    label: "Enforcement",
    items: [
      {
        label: "Impounding Log",
        icon: impoundingLogIcon,
        path: "/impounding-staff/log",
        active: true,
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Active Impounding",
        icon: activeImpoundingIcon,
        path: "/impounding-staff/active",
      },
      {
        label: "Field Updates",
        icon: fieldUpdatesIcon,
        path: "/impounding-staff/field-updates",
      },
    ],
  },
];

/* ------------------------------------------------------------------
   HELPERS
------------------------------------------------------------------ */
const formatDateTime = (ts: Timestamp | null): string => {
  if (!ts) return "—";
  try {
    return ts.toDate().toLocaleString("en-US", {
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
 * Accepts both the old labels (Impounded / Released) and the design's
 * labels (Clamped / Removed) so either kind of document displays correctly.
 */
const normalizeStatus = (raw: unknown): LogStatus => {
  const value = String(raw ?? "").toLowerCase();
  if (value === "released" || value === "removed") return "Removed";
  if (value === "clamped") return "Clamped";
  return "Impounded";
};

const getStatusClass = (status: LogStatus): string => {
  const map: Record<LogStatus, string> = {
    Clamped: "status-clamped",
    Impounded: "status-impounded",
    Removed: "status-released",
  };
  return map[status];
};

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function ImpoundingLog() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "impounding-staff",
  });

  const [logs, setLogs] = useState<ImpoundLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [violationFilter, setViolationFilter] = useState(ALL_VIOLATIONS);
  const [currentPage, setCurrentPage] = useState(1);

  /* Fetch current user */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) {
        setCurrentUser({ name: "Guest", role: "impounding-staff" });
        return;
      }
      try {
        const userDocRef = doc(db, "users", loggedUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          setCurrentUser({
            name: data.name ?? "Unknown",
            role: (data.role ?? "impounding-staff") as RoleSlug,
          });
        } else {
          setCurrentUser({
            name: loggedUser.email?.split("@")[0] ?? "Unknown",
            role: "impounding-staff",
          });
        }
      } catch (err) {
        console.error("Error fetching current user:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  /**
   * Fetch impound logs.
   *
   * No orderBy() on purpose: Firestore silently drops documents that lack
   * the ordered field, so a log entry without a timestamp would just
   * vanish from the page. Sorting happens client-side instead.
   */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "impoundLogs"),
      (snap) => {
        const rows: ImpoundLogRow[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              // Fallback chains — the enforcer app / impound flow needs to
              // write one of these for the columns to fill in.
              reference: data.referenceNumber ?? data.paymentReference ?? null,
              cin: data.cin ?? "—",
              plateNo: data.plateNo ?? "—",
              violation: data.violationType ?? data.violation ?? "—",
              location: data.location ?? "—",
              towedBy: data.towedBy ?? "—",
              timestamp: (data.timestamp as Timestamp) ?? null,
              status: normalizeStatus(data.status),
            };
          })
          .sort((a, b) => millis(b.timestamp) - millis(a.timestamp));

        setLogs(rows);
        setLoading(false);
      },
      (err) => {
        console.warn("Impound logs fetch failed:", err.code);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  /* Click outside dropdown */
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
      navigate("/");
    } catch (err) {
      console.error("Logout error:", err);
      setIsMenuOpen(false);
      navigate("/");
    }
  };

  const handleChangePassword = () => {
    console.log("Navigating to Change Password...");
    setIsMenuOpen(false);
  };

  /* Violation filter options come from the data itself */
  const violationOptions = useMemo(() => {
    const unique = new Set<string>();
    logs.forEach((row) => {
      if (row.violation && row.violation !== "—") unique.add(row.violation);
    });
    return [ALL_VIOLATIONS, ...Array.from(unique).sort()];
  }, [logs]);

  /* Search + filter */
  const filteredLogs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return logs.filter((row) => {
      const matchesSearch =
        !q ||
        row.cin.toLowerCase().includes(q) ||
        row.plateNo.toLowerCase().includes(q);
      const matchesViolation =
        violationFilter === ALL_VIOLATIONS || row.violation === violationFilter;
      return matchesSearch && matchesViolation;
    });
  }, [logs, searchQuery, violationFilter]);

  /* Pagination */
  const totalPages = Math.max(
    1,
    Math.ceil(filteredLogs.length / ITEMS_PER_PAGE)
  );
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedLogs = filteredLogs.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  );

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  return (
    <div className="impounding-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <img src={mtpbLogo} alt="MTPB Logo" className="sidebar-logo-img" />
            <div>
              <p className="sidebar-brand-name">MTPB</p>
              <p className="sidebar-brand-role">Impounding Staff</p>
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
              <h1>Impounding Log</h1>
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
                alt="Staff Profile"
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
                  <button
                    className="dropdown-item"
                    onClick={handleChangePassword}
                  >
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
            {/* SEARCH + FILTER */}
            <div className="log-toolbar">
              <div className="log-search">
                <input
                  type="text"
                  className="log-search-input"
                  placeholder="Search CIN, Plate No..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  aria-label="Search by CIN or plate number"
                />
                <Search size={20} className="log-search-icon" />
              </div>

              <div className="log-filter">
                <select
                  className="log-filter-select"
                  value={violationFilter}
                  onChange={(e) => {
                    setViolationFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  aria-label="Filter by violation"
                >
                  {violationOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <ChevronDown size={20} className="log-filter-icon" />
              </div>
            </div>

            {/* IMPOUNDING LOG TABLE */}
            <div className="card log-card">
              <div className="log-header">
                <div>
                  <p className="card-eyebrow">Sector 3</p>
                  <h2 className="card-title">Impounding Log</h2>
                </div>
                <p className="log-total">
                  Impounded vehicles: <strong>{logs.length} total</strong>
                </p>
              </div>

              {loading ? (
                <div className="table-loading">
                  <p>Loading impounding log...</p>
                </div>
              ) : paginatedLogs.length === 0 ? (
                <div className="table-empty">
                  <p>
                    {logs.length === 0
                      ? "No impounding records found."
                      : "No records match your search or filter."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="log-table-wrapper">
                    <table className="log-table">
                      <thead>
                        <tr>
                          <th>Reference</th>
                          <th>CIN</th>
                          <th>Plate No.</th>
                          <th>Violation</th>
                          <th>Location</th>
                          <th>Towed by</th>
                          <th>Time</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedLogs.map((row) => (
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
                            <td className="cell-towed-by">{row.towedBy}</td>
                            <td className="cell-time">
                              {formatDateTime(row.timestamp)}
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
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* PAGINATION */}
                  <div className="pagination">
                    <button
                      type="button"
                      className="pagination-btn"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft size={16} />
                      Previous
                    </button>

                    <div className="pagination-info">
                      <span className="pagination-page">{currentPage}</span>
                      <span className="pagination-sep">
                        of {totalPages} pages
                      </span>
                    </div>

                    <button
                      type="button"
                      className="pagination-btn"
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={currentPage === totalPages}
                    >
                      Next
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}