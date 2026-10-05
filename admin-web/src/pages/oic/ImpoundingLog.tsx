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
import "./ImpoundingLog.css";

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

type LogStatus = "Clamped" | "Removed";

type ImpoundLogRow = {
  id: string;
  reference: string | null;
  cin: string;
  plateNo: string;
  violation: string;
  location: string;
  officer: string;
  recordedAt: Timestamp | null;
  status: LogStatus;
};

type NavItem = { label: string; icon: string; path: string; active?: boolean };
type NavGroup = { label: string; items: NavItem[] };

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
        active: true,
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
 * Same two-state mapping as oic/ClampingLog.tsx, since this page reads the
 * same `violations` collection — just filtered to enforcementType ==
 * "impounded" instead of "clamped". "Removed" once the release flow has
 * actually released it (releaseStatus === "Released"); "Clamped" for
 * everything before that, matching the vocabulary the design uses (the
 * vehicle is still physically immobilized/ticketed on-site — this system
 * has no towing, so "impounded" here means ticketed at the unit, not
 * hauled to a yard).
 */
const deriveLogStatus = (releaseStatus: unknown): LogStatus =>
  releaseStatus === "Released" ? "Removed" : "Clamped";

const getStatusClass = (status: LogStatus): string =>
  status === "Removed" ? "status-removed" : "status-clamped";

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function ImpoundingLog() {
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "oic",
  });
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [rows, setRows] = useState<ImpoundLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [violationFilter, setViolationFilter] = useState(ALL_VIOLATIONS);
  const [currentPage, setCurrentPage] = useState(1);

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
   * Impounding actions only (enforcementType == "impounded") — clamping has
   * its own log page. No orderBy() on purpose: Firestore silently drops
   * documents that lack the ordered field, so a record without recordedAt
   * would vanish instead of showing up out of order. Sorting happens
   * client-side.
   */
  useEffect(() => {
    const q = query(
      collection(db, "violations"),
      where("enforcementType", "==", "impounded")
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const fetched: ImpoundLogRow[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              reference:
                (data.referenceNumber as string) ??
                (data.paymentReference as string) ??
                null,
              cin: data.cin ?? "—",
              plateNo: data.plateNo ?? "—",
              violation: data.violationType ?? "—",
              location: data.location ?? "—",
              officer: data.officer ?? "—",
              recordedAt: (data.recordedAt as Timestamp) ?? null,
              status: deriveLogStatus(data.releaseStatus),
            };
          })
          .sort((a, b) => millis(b.recordedAt) - millis(a.recordedAt));

        setRows(fetched);
        setLoading(false);
      },
      (err) => {
        console.warn("Impounding log fetch failed:", err.code);
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

  /* Violation filter options come from the data itself */
  const violationOptions = useMemo(() => {
    const unique = new Set<string>();
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

  const impoundedCount = useMemo(
    () => rows.filter((r) => r.status === "Clamped").length,
    [rows]
  );

  /* Pagination */
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));
  // Clamped here, during render, instead of a useEffect that "corrects"
  // state after the fact — same fix applied to ClampingLog.tsx.
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = filteredRows.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, violationFilter]);

  return (
    <div className="oic-page impound-log-page">
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

          <main className="main-content impounding-body">
            {/* SEARCH + FILTER */}
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

            {/* TABLE */}
            <div className="card impounding-card">
              <div className="log-header">
                <p className="card-eyebrow">Sector 3</p>
                <div className="log-header-meta">
                  Impounded vehicles: {impoundedCount} total
                </div>
              </div>
              <h2 className="card-title" style={{ marginBottom: 16 }}>
                Impounding Log
              </h2>

              {loading ? (
                <div className="table-loading">
                  <p>Loading impounding log...</p>
                </div>
              ) : paginatedRows.length === 0 ? (
                <div className="impounding-empty">
                  {rows.length === 0
                    ? "No impounding records found."
                    : "No records match your search or filter."}
                </div>
              ) : (
                <div className="impounding-table-wrap">
                  <table className="data-table">
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
                          <td className="cell-officer">{row.officer}</td>
                          <td className="cell-time">
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
    </div>
  );
}