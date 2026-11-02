import { useState, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  PanelRightOpen } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
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
import ReleaseDetailsDrawer from "../../components/ReleaseDetailsDrawer";
import { locationDetailsOf, type LocationDetails } from "../../lib/locationDetails";
import "../../pages/record-officer/ReleaseLog.css";

// Asset imports
import overviewIcon from "../../assets/overview.png";
import allViolationsIcon from "../../assets/allviolations.png";
import clampingIcon from "../../assets/clamping.png";
import impoundingLogIcon from "../../assets/impounding.png";
import releaseLogIcon from "../../assets/releaselog.png";
import allReportsIcon from "../../assets/reports.png";
import exportCenterIcon from "../../assets/export.png";
import AppTopbar from "../../components/AppTopbar";
import AppSidebar from "../../components/AppSidebar";

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

type ReleaseLogRow = {
  id: string;
  orderId: string;
  plateNo: string;
  clearedBy: string;
  location: string;
  /** District, barangay and exact spot (lib/locationDetails.ts) */
  details: LocationDetails;
  dateTime: Timestamp | null;
  totalFinePaid: number | null;
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
        active: true,
      },
    ],
  },
  {
    label: "Reports",
    items: [
      {
        label: "All Reports",
        icon: allReportsIcon,
        path: "/record-officer/reports",
      },
      {
        label: "Export Center",
        icon: exportCenterIcon,
        path: "/record-officer/export",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
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

const formatCurrency = (amount: number | null): string => {
  if (amount === null || amount === undefined) return "—";
  return `₱${amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
};

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------
export default function ReleaseLog() {

  const [, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "record-officer",
  });

  const [logs, setLogs] = useState<ReleaseLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Search + Pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [districtFilter, setDistrictFilter] = useState("All Districts");
  /** The record open in the Release Details window (read-only) */
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  // EFFECT: Real-time listener for released violations
  // -----------------------------------------------------------------------
  useEffect(() => {
    const q = query(
      collection(db, "violations"),
      where("releaseStatus", "==", "Released")
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const rows: ReleaseLogRow[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              orderId: data.releaseOrderId ?? "—",
              plateNo: data.plateNo ?? "—",
              clearedBy: data.releasedBy ?? data.updatedBy ?? "—",
              location: data.location ?? "—",
              details: locationDetailsOf(data),
              dateTime: (data.releasedAt as Timestamp) ?? null,
              totalFinePaid:
                typeof data.totalPaid === "number"
                  ? data.totalPaid
                  : typeof data.fineAmount === "number"
                  ? data.fineAmount
                  : null,
            };
          })
          .sort((a, b) => {
            const at = a.dateTime?.toMillis() ?? 0;
            const bt = b.dateTime?.toMillis() ?? 0;
            return bt - at;
          });
        setLogs(rows);
        setLoading(false);
      },
      (err) => {
        console.warn("Release log fetch failed:", err.code);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // -----------------------------------------------------------------------
  // EFFECT: Click-outside for dropdown
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // HANDLERS
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // DERIVED: Filter + Pagination
  // -----------------------------------------------------------------------
  const districtOptions = Array.from(
    new Set(logs.map((l) => l.details.district).filter((d): d is string => !!d))
  ).sort();

  const filteredLogs = logs.filter((log) => {
    if (districtFilter !== "All Districts" && log.details.district !== districtFilter) {
      return false;
    }
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      log.orderId.toLowerCase().includes(q) ||
      log.plateNo.toLowerCase().includes(q) ||
      log.clearedBy.toLowerCase().includes(q) ||
      log.location.toLowerCase().includes(q) ||
      log.details.exact.toLowerCase().includes(q) ||
      (log.details.barangay ?? "").toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(
    1,
    Math.ceil(filteredLogs.length / ITEMS_PER_PAGE)
  );
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const paginatedLogs = filteredLogs.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  );

  const releasedToday = logs.filter((log) => {
    if (!log.dateTime) return false;
    try {
      return (
        log.dateTime.toDate().toDateString() === new Date().toDateString()
      );
    } catch {
      return false;
    }
  }).length;

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------
  return (
    <div className="record-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <AppSidebar groups={NAV_GROUPS} role={<>Record Officer</>} />

        {/* MAIN */}
        <div className="main">
          <AppTopbar groups={NAV_GROUPS} />
          <header className="main-header">
            <div>
              <h1>Release Log</h1>
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
            {/* SEARCH BAR + DISTRICT FILTER */}
            <div className="search-with-filter">
              <div className="log-search-bar">
                <Search size={18} className="log-search-icon" />
                <input
                  type="text"
                  className="log-search-input"
                  placeholder="Search Order ID, Plate No., street, barangay..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>
              <select
                className="district-filter"
                value={districtFilter}
                onChange={(e) => {
                  setDistrictFilter(e.target.value);
                  setCurrentPage(1);
                }}
                aria-label="Filter by district"
              >
                <option value="All Districts">All Districts</option>
                {districtOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div className="card">
              <div className="card-header-row">
                <div>
                  <p className="card-eyebrow">Sector 3 · History</p>
                  <h2 className="card-title">Release Log</h2>
                </div>
                <p className="log-total">
                  Released today:{" "}
                  <strong>
                    {releasedToday} {releasedToday === 1 ? "vehicle" : "vehicles"}
                  </strong>
                </p>
              </div>

              {loading ? (
                <div className="table-loading">
                  <p>Loading release log...</p>
                </div>
              ) : paginatedLogs.length === 0 ? (
                <div className="table-empty">
                  <p>
                    {logs.length === 0
                      ? "No release history yet."
                      : "No released vehicles match your search or district."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="table-wrapper" tabIndex={0} role="region" aria-label="Data table" data-scroll-region>
                    <table className="data-table release-log-table">
                      <thead>
                        <tr>
                          <th>Order ID</th>
                          <th>Plate No.</th>
                          <th>Cleared by</th>
                          <th>District</th>
                          <th>Date &amp; Time</th>
                          <th>Total Fine Paid</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedLogs.map((row) => (
                          <tr key={row.id} className="rd-row" onClick={() => setSelectedId(row.id)}>
                            <td className="cell-order-id">{row.orderId}</td>
                            <td className="cell-plate">{row.plateNo}</td>
                            <td className="cell-cleared-by">
                              {row.clearedBy}
                            </td>
                            <td className="cell-district">
                              {row.details.district ? (
                                <span className="district-pill">{row.details.district}</span>
                              ) : (
                                "—"
                              )}
                              {row.details.barangay && (
                                <span className="cell-barangay">{row.details.barangay}</span>
                              )}
                            </td>
                            <td className="cell-datetime">
                              {formatDateTime(row.dateTime)}
                            </td>
                            <td className="cell-fine">
                              {formatCurrency(row.totalFinePaid)}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="rd-view-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedId(row.id);
                                }}
                              >
                                <PanelRightOpen size={15} />
                                View
                              </button>
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
                      onClick={() =>
                        setCurrentPage((p) => Math.max(1, p - 1))
                      }
                      disabled={safePage === 1}
                    >
                      <ChevronLeft size={16} />
                      Previous
                    </button>

                    <div className="pagination-info">
                      <span className="pagination-page">{safePage}</span>
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
                      disabled={safePage === totalPages}
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

      {selectedId && (
        <ReleaseDetailsDrawer violationId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
