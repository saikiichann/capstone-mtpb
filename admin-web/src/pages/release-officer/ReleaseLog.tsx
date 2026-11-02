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
  Timestamp,
  where,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import { NotificationBell } from "../../components/NotificationBell";
import { useRegisteredOwners } from "../../lib/registeredOwners";
import { locationDetailsOf, type LocationDetails } from "../../lib/locationDetails";
import ReleaseDetailsDrawer from "../../components/ReleaseDetailsDrawer";
import "./ReleaseLog.css";

import overviewIcon from "../../assets/overview.png";
import queueIcon from "../../assets/queue.png";
import releaseLogIcon from "../../assets/releaselog.png";
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
  dateTime: Timestamp | null;
  totalFinePaid: number | null;
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


const NAV_GROUPS: NavGroup[] = [
  {
    label: "Dashboard",
    items: [
      { label: "Overview", icon: overviewIcon, path: "/release-officer" },
    ],
  },
  {
    label: "Vehicle Release",
    items: [
      {
        label: "Release Queue",
        icon: queueIcon,
        path: "/release-officer/queue",
      },
      {
        label: "Release Log",
        icon: releaseLogIcon,
        path: "/release-officer/log",
        active: true,
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

const formatCurrency = (amount: number | null): string => {
  if (amount === null || amount === undefined) return "—";
  return `₱${amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
};

/* ------------------------------------------------------------------
  MAIN COMPONENT
------------------------------------------------------------------ */
export default function ReleaseLog() {

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "release-officer",
  });
  const [currentUserUid, setCurrentUserUid] = useState<string>("");

  const [rawLogs, setLogs] = useState<ReleaseLogRow[]>([]);
  /** Guest → Registered kapag naka-register (active) ang plate sa violator app */
  const logs = useRegisteredOwners(rawLogs);
  const [loading, setLoading] = useState(true);

  // Search + Pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [districtFilter, setDistrictFilter] = useState("All Districts");
  /** The record open in the Release Details panel (read-only here) */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  /* Fetch current user */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) {
        setCurrentUser({ name: "Guest", role: "release-officer" });
        setCurrentUserUid("");
        return;
      }
      setCurrentUserUid(loggedUser.uid);
      try {
        const snap = await getDoc(doc(db, "users", loggedUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          setCurrentUser({
            name: data.name ?? "Unknown",
            role: (data.role ?? "release-officer") as RoleSlug,
          });
        }
      } catch (err) {
        console.error(err);
      }
    });
    return () => unsubscribe();
  }, []);

  /**
   * Fetch release log from violations.
   *
   * where("releaseStatus", "in", [...]) instead of orderBy("releasedAt") —
   * the old query relied on Firestore silently dropping every document
   * that lacks the ordered field, which happened to work here only
   * because non-released violations don't have releasedAt yet. That's an
   * implicit side effect, not a real filter: a released violation that's
   * somehow missing releasedAt would have silently vanished from this
   * page instead of showing up with a "—". An explicit where() doesn't
   * have that failure mode, and sorting moves client-side since Firestore
   * can't combine a multi-value "in" filter with a server-side orderBy
   * on a different field without a composite index.
   */
  useEffect(() => {
    const q = query(
      collection(db, "violations"),
      where("releaseStatus", "in", ["Released", "Cancelled"])
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const rows: ReleaseLogRow[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              // Real sequential ID written by markViolationAsReleased()
              // in lib/release.ts — no longer generated client-side.
              orderId: data.releaseOrderId ?? "—",
              plateNo: data.plateNo ?? "—",
              clearedBy: data.releasedBy ?? data.updatedBy ?? "—",
              location: data.location ?? "—",
              details: locationDetailsOf(data),
              dateTime: data.releasedAt ?? null,
              totalFinePaid:
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
          .sort((a, b) => {
            const at = a.dateTime?.toMillis() ?? 0;
            const bt = b.dateTime?.toMillis() ?? 0;
            return bt - at;
          });
        setLogs(rows);
        setLoading(false);
      },
      (err) => {
        console.warn(err.code);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  /* Filter + Pagination */
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
      (log.details.barangay ?? "").toLowerCase().includes(q) ||
      // ⚠️ ADDED: search by violator name
      (log.violatorName?.toLowerCase().includes(q) ?? false)
    );
  });

  const totalPages = Math.max(
    1,
    Math.ceil(filteredLogs.length / ITEMS_PER_PAGE)
  );
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedLogs = filteredLogs.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  );

  const handlePreviousPage = () => {
    setCurrentPage((p) => Math.max(1, p - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((p) => Math.min(totalPages, p + 1));
  };

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

  return (
    <div className="release-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <AppSidebar groups={NAV_GROUPS} role={<>Release Officer</>} />

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

            <div className="header-right-group">
              {currentUserUid && (
                <NotificationBell currentUserUid={currentUserUid} officerName={currentUser.name} />
              )}
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
                  placeholder="Search Order ID, Plate No., Violator, street..."
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
                  Released Today: <strong>{releasedToday} vehicles</strong>
                </p>
              </div>

              {loading ? (
                <div className="table-loading">
                  <p>Loading release log...</p>
                </div>
              ) : paginatedLogs.length === 0 ? (
                <div className="table-empty">
                  <p>No release history yet.</p>
                </div>
              ) : (
                <>
                  <div className="table-wrapper" tabIndex={0} role="region" aria-label="Data table" data-scroll-region>
                    <table className="data-table release-log-table">
                      <thead>
                        <tr>
                          <th>Order ID</th>
                          <th>Plate No.</th>
                          <th>Violator</th>{/* ⚠️ ADDED */}
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

                            <td className="cell-district">
                              {row.details.district ? (
                                <span className="district-pill">{row.details.district}</span>
                              ) : (
                                "—"
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
                      onClick={handlePreviousPage}
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
                      onClick={handleNextPage}
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
      {selectedId && (
        <ReleaseDetailsDrawer violationId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}