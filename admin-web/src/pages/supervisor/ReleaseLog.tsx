/* ------------------------------------------------------------------
   SUPERVISOR — Release Log (/supervisor/release-log)

   The Supervisor's own page: same content as the OIC's Release Log, but
   with the Supervisor's sidebar (no Payment/Finance; links stay on
   /supervisor/...). The Supervisor monitors operations and approves
   vehicle release; payments are not handled here.
   Monitoring.
   Styles: ./ReleaseLog.css (a copy of the OIC page's CSS).
------------------------------------------------------------------ */
import { useState, useEffect, useMemo } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
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
import { useRegisteredOwners } from "../../lib/registeredOwners";
import { locationDetailsOf, type LocationDetails } from "../../lib/locationDetails";
import ReleaseDetailsDrawer from "../../components/ReleaseDetailsDrawer";
import "./ReleaseLog.css";


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

type ReleaseLogRow = {
  id: string;
  orderId: string;
  plateNo: string;
  clearedBy: string;
  location: string;
  /** District, barangay and exact spot (lib/locationDetails.ts) */
  details: LocationDetails;
  releasedAt: Timestamp | null;
  finePaid: number | null;
  // ⚠️ ADDED: violator identity fields
  violatorUid: string | null;
  guestId: string | null;
  violatorName: string | null;
};

type NavItem = { label: string; icon: string; path: string; active?: boolean };
type NavGroup = { label: string; items: NavItem[] };

/* ------------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------------ */
const ITEMS_PER_PAGE = 10;

const ROLE_LABELS: Record<RoleSlug, string> = {
  oic: "Officer in Charge",
  "it-admin": "IT Admin",
  supervisor: "Supervisor",
  "record-officer": "Record Officer",
  "release-officer": "Release Officer",
  finance: "Finance Staff",
  "clamping-staff": "Clamping Staff",
  "impounding-staff": "Impounding Staff",
};

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
        active: true,
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
const formatCurrency = (amount: number | null): string => {
  if (amount === null) return "—";
  return `₱${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

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

const isToday = (ts: Timestamp | null): boolean => {
  if (!ts) return false;
  try {
    return ts.toDate().toDateString() === new Date().toDateString();
  } catch {
    return false;
  }
};

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function SupervisorReleaseLog() {

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "supervisor",
  });

  const [rawRows, setRows] = useState<ReleaseLogRow[]>([]);
  /** Guest → Registered kapag naka-register (active) ang plate sa violator app */
  const rows = useRegisteredOwners(rawRows);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [districtFilter, setDistrictFilter] = useState("All Districts");
  /** The record open in the Release Details window (read-only) */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

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
   * Reads `violations` directly — NOT the `releaseLog` collection — to
   * match the Release Officer's own ReleaseLog.tsx, which is the
   * established working pattern. `totalPaid` is already on the violation
   * document from the payment-verification step and never gets cleared,
   * so it doesn't need to flow through a separate collection to be
   * available here. `releaseOrderId` is the real sequential ID written by
   * markViolationAsReleased() in lib/release.ts (see ORD-YYYY-NNNNN).
   *
   * An explicit where() is used instead of the Release Officer file's
   * orderBy("releasedAt") — that works there only because Firestore
   * silently drops every document missing the ordered field, which
   * happens to filter out everything that isn't released. That's an
   * implicit side effect, not a real filter, and this project avoids
   * relying on it elsewhere (see ClampingLog.tsx, ImpoundingLog.tsx) for
   * the same reason: a released violation that's somehow missing
   * releasedAt would silently vanish instead of showing up with a "—".
   */
  useEffect(() => {
    const q = query(
      collection(db, "violations"),
      where("releaseStatus", "==", "Released")
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const fetched: ReleaseLogRow[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              orderId: data.releaseOrderId ?? "—",
              plateNo: data.plateNo ?? "—",
              clearedBy: data.releasedBy ?? data.updatedBy ?? "—",
              location: data.location ?? "—",
              details: locationDetailsOf(data),
              releasedAt: (data.releasedAt as Timestamp) ?? null,
              finePaid:
                typeof data.totalPaid === "number"
                  ? data.totalPaid
                  : typeof data.fineAmount === "number"
                  ? data.fineAmount
                  : null,
              // ⚠️ ADDED: violator identity (null-safe fallbacks)
              violatorUid: (data.violatorUid as string) ?? null,
              guestId: (data.guestId as string) ?? null,
              violatorName: (data.violatorName as string) ?? null,
            };
          })
          .sort((a, b) => millis(b.releasedAt) - millis(a.releasedAt));

        setRows(fetched);
        setLoading(false);
      },
      (err) => {
        console.warn("Release log fetch failed:", err.code);
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

  const districtOptions = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r) => r.details.district).filter((d): d is string => !!d))
      ).sort(),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return rows.filter((row) => {
      if (districtFilter !== "All Districts" && row.details.district !== districtFilter) {
        return false;
      }
      if (!q) return true;
      return (
        row.orderId.toLowerCase().includes(q) ||
        row.plateNo.toLowerCase().includes(q) ||
        row.clearedBy.toLowerCase().includes(q) ||
        row.location.toLowerCase().includes(q) ||
        row.details.exact.toLowerCase().includes(q) ||
        (row.details.barangay ?? "").toLowerCase().includes(q) ||
        // ⚠️ ADDED: search by violator name
        (row.violatorName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, searchQuery, districtFilter]);

  /**
   * Actually filtered to today's date — the old mock just showed
   * rows.length (the full sample array) mislabeled as "today".
   */
  const releasedToday = useMemo(
    () => rows.filter((r) => isToday(r.releasedAt)).length,
    [rows]
  );

  /* Pagination */
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = filteredRows.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // Back to page 1 when these change (during render, not in an effect)
  const pageResetKey = JSON.stringify([searchQuery, districtFilter]);
  const [prevPageResetKey, setPrevPageResetKey] = useState(pageResetKey);
  if (pageResetKey !== prevPageResetKey) {
    setPrevPageResetKey(pageResetKey);
    setCurrentPage(1);
  }

  return (
    <div className="oic-page release-log-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <AppSidebar groups={navGroups} role={<>{ROLE_LABELS[currentUser.role]}</>} />

        {/* MAIN */}
        <div className="main">
          <AppTopbar groups={navGroups} />
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
            {/* SEARCH + DISTRICT FILTER */}
            <div className="search-with-filter">
              <div className="search-bar-container">
                <Search size={18} className="search-bar-icon" />
                <input
                  type="text"
                  className="search-bar-input"
                  placeholder="Search Order ID, Plate No., Violator, street..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <select
                className="district-filter"
                value={districtFilter}
                onChange={(e) => setDistrictFilter(e.target.value)}
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

            {/* TABLE */}
            <div className="card release-log-card">
              <div className="log-header">
                <p className="card-eyebrow">Sector 3 · History</p>
                <div className="log-header-meta">
                  Released Today: <strong>{releasedToday} vehicles</strong>
                </div>
              </div>
              <h2 className="card-title" style={{ marginBottom: 16 }}>
                Release Log
              </h2>

              {loading ? (
                <div className="table-loading">
                  <p>Loading release log...</p>
                </div>
              ) : paginatedRows.length === 0 ? (
                <div className="release-log-empty">
                  {rows.length === 0
                    ? "No released vehicles yet."
                    : "No released vehicles match your search or district."}
                </div>
              ) : (
                <div className="release-log-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Order ID</th>
                        <th>Plate No.</th>
                        <th>Violator</th>{/* ⚠️ ADDED */}
                        <th>Cleared by</th>
                        <th>District</th>
                        <th>Date &amp; Time</th>
                        <th>Total Fine Paid</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRows.map((row) => (
                        <tr key={row.id} className="rd-row" onClick={() => setSelectedId(row.id)}>
                          <td className="cell-order-id">{row.orderId}</td>
                          <td className="cell-plate">{row.plateNo}</td>

                          {/* ⚠️ ADDED: Violator cell */}
                          <td className="cell-violator">
                            {row.violatorName ? (
                              <div className="violator-cell">
                                <span className="violator-name">
                                  {row.violatorName}
                                </span>
                                {row.violatorUid && (
                                  <span className="violator-tag uid">
                                    Registered
                                  </span>
                                )}
                                {row.guestId && (
                                  <span className="violator-tag guest">
                                    Guest
                                  </span>
                                )}
                              </div>
                            ) : row.violatorUid ? (
                              <span className="violator-tag uid">
                                Registered User
                              </span>
                            ) : row.guestId ? (
                              <span className="violator-tag guest">
                                Guest
                              </span>
                            ) : (
                              <span className="cell-empty">—</span>
                            )}
                          </td>
                          {/* End */}

                          <td className="cell-cleared-by">{row.clearedBy}</td>
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
                          <td className="cell-time">
                            {formatDateTime(row.releasedAt)}
                          </td>
                          <td className="cell-fine">
                            {formatCurrency(row.finePaid)}
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
      {selectedId && (
        <ReleaseDetailsDrawer violationId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}