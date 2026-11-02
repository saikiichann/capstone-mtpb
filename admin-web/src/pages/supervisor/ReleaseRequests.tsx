/* ------------------------------------------------------------------
   SUPERVISOR — Release Requests (/supervisor/release-requests)

   The Supervisor's own page: same content as the OIC's Release Requests, but
   with the Supervisor's sidebar (no Payment/Finance; links stay on
   /supervisor/...). The Supervisor monitors operations and approves
   vehicle release; payments are not handled here.
   Approves or rejects release requests (recorded as the Supervisor's decision).
   Notifies all active release officers on approval/rejection.
   Styles: ./ReleaseRequests.css (a copy of the OIC page's CSS).
------------------------------------------------------------------ */
import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
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
import {
  AWAITING_OIC_STATUS,
  decideReleaseRequest,
  queueSortKey,
  computeWaitingMinutes,
} from "../../lib/release";
import {
  notifyReleaseOfficersOfApproval,
  notifyReleaseOfficersOfRejection,
} from "../../lib/notifications";
import "./ReleaseRequests.css";


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

type ReleaseRequestRow = {
  id: string;
  queue: string;
  cin: string;
  plateNo: string;
  vehicleType: string;
  location: string;
  clampId: string | null;
  amountPaid: number | null;
  waitingMinutes: number;
  verifiedBy: string;
  verifiedAt: Timestamp | null;
  violatorUid: string | null;
  guestId: string | null;
  violatorName: string | null;
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
const ITEMS_PER_PAGE = 10;

const AWAITING_DECISION_STATUSES = new Set<string>([
  AWAITING_OIC_STATUS,
  "Ready for Release",
  "Pending",
  "",
]);

const isAwaitingOicDecision = (data: { releaseStatus?: unknown }): boolean =>
  AWAITING_DECISION_STATUSES.has(String(data.releaseStatus ?? "").trim());


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
      { label: "Geospatial Heatmap", icon: mapIcon, path: "/supervisor/heatmap" },
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
        active: true,
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
const formatCurrency = (amount: number | null): string => {
  if (amount === null) return "—";
  return `₱${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatWaiting = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours > 1 ? "s" : ""}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""}`;
};

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function SupervisorReleaseRequests() {

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "supervisor",
  });

  const [rawRows, setRows] = useState<ReleaseRequestRow[]>([]);
  /** Guest → Registered kapag naka-register (active) ang plate sa violator app */
  const rows = useRegisteredOwners(rawRows);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
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

  useEffect(() => {
    const q = query(
      collection(db, "violations"),
      where("paymentStatus", "==", "Verified")
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const millis = (ts: Timestamp | null) => {
          try {
            return ts ? ts.toMillis() : Number.MAX_SAFE_INTEGER;
          } catch {
            return Number.MAX_SAFE_INTEGER;
          }
        };

        const fetched: ReleaseRequestRow[] = snap.docs
          .filter((d) => isAwaitingOicDecision(d.data()))
          .sort(
            (a, b) =>
              millis(queueSortKey(a.data())) - millis(queueSortKey(b.data()))
          )
          .map((d, index) => {
            const data = d.data();
            const sortKey = queueSortKey(data);
            return {
              id: d.id,
              queue: `Q-${String(index + 1).padStart(3, "0")}`,
              cin: data.cin ?? "—",
              plateNo: data.plateNo ?? "—",
              vehicleType: data.vehicleType ?? "—",
              location: data.location ?? "—",
              clampId: (data.clampId as string) ?? null,
              amountPaid:
                typeof data.totalPaid === "number" ? data.totalPaid : null,
              waitingMinutes: computeWaitingMinutes(sortKey),
              verifiedBy: data.verifiedBy ?? "—",
              verifiedAt: (data.verifiedAt as Timestamp) ?? null,
              violatorUid: (data.violatorUid as string) ?? null,
              guestId: (data.guestId as string) ?? null,
              violatorName: (data.violatorName as string) ?? null,
            };
          });

        setRows(fetched);
        setLoading(false);
      },
      (err) => {
        console.warn("Release requests fetch failed:", err.code);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleApprove = async (row: ReleaseRequestRow) => {
    // FIFO guard
    if (rows.length > 0 && rows[0].id !== row.id) {
      const proceed = window.confirm(
        `FIFO order puts ${rows[0].cin} (${rows[0].queue}) ahead of ${row.cin}.\n\n` +
          `Approving out of order breaks the First-In, First-Out rule. Continue anyway?`
      );
      if (!proceed) return;
    }

    const violatorDisplay = row.violatorName
      ? row.violatorName
      : row.violatorUid
      ? "Registered User"
      : row.guestId
      ? "Guest"
      : "—";

    if (
      !window.confirm(
        `Approve release for ${row.cin}?\n\n` +
          `Violator: ${violatorDisplay}\n` +
          `Plate: ${row.plateNo}\n` +
          `Vehicle: ${row.vehicleType}\n` +
          `Amount paid: ${formatCurrency(row.amountPaid)}\n\n` +
          `This sends the vehicle to the Release Officer's queue.`
      )
    ) {
      return;
    }

    setActioning(row.id);
    try {
      await decideReleaseRequest({
        violationId: row.id,
        cin: row.cin,
        plateNo: row.plateNo,
        clampId: row.clampId,
        approve: true,
        officerName: currentUser.name,
        officerRole: "supervisor",
      });

      // ✅ BAGO: Notify all active release officers
      await notifyReleaseOfficersOfApproval({
        cin: row.cin,
        plateNo: row.plateNo,
        violationId: row.id,
        approvedBy: currentUser.name,
        location: row.location,
      });
    } catch (err) {
      console.error("Approve failed:", err);
      alert((err as Error)?.message || "Failed to approve the release request.");
    } finally {
      setActioning(null);
    }
  };

  const handleReject = async (row: ReleaseRequestRow) => {
    const violatorDisplay = row.violatorName
      ? row.violatorName
      : row.violatorUid
      ? "Registered User"
      : row.guestId
      ? "Guest"
      : "—";

    const reason = window.prompt(
      `Reject release for ${row.cin}?\n\n` +
        `Violator: ${violatorDisplay}\n` +
        `Plate: ${row.plateNo}\n\n` +
        `Enter the reason — this is recorded against the case and the violator has already paid, so the ground for refusal needs to be on file:`
    );
    if (reason === null) return;
    if (!reason.trim()) {
      alert("A rejection reason is required.");
      return;
    }

    setActioning(row.id);
    try {
      await decideReleaseRequest({
        violationId: row.id,
        cin: row.cin,
        plateNo: row.plateNo,
        approve: false,
        reason: reason.trim(),
        officerName: currentUser.name,
        officerRole: "supervisor",
      });

      // ✅ BAGO: Notify all active release officers of rejection
      await notifyReleaseOfficersOfRejection({
        cin: row.cin,
        plateNo: row.plateNo,
        violationId: row.id,
        rejectedBy: currentUser.name,
        reason: reason.trim(),
      });
    } catch (err) {
      console.error("Reject failed:", err);
      alert((err as Error)?.message || "Failed to reject the release request.");
    } finally {
      setActioning(null);
    }
  };

  /* Filter + pagination */
  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.cin.toLowerCase().includes(q) ||
        r.plateNo.toLowerCase().includes(q) ||
        r.location.toLowerCase().includes(q) ||
        r.queue.toLowerCase().includes(q) ||
        (r.violatorName?.toLowerCase().includes(q) ?? false)
    );
  }, [rows, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Keep the page valid if the list shrinks (during render)
  if (currentPage > totalPages) setCurrentPage(totalPages);

  return (
    <div className="oic-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <AppSidebar groups={NAV_GROUPS} role={<>Supervisor</>} />

        {/* MAIN */}
        <div className="main">
          <AppTopbar groups={NAV_GROUPS} />
          <header className="main-header">
            <div>
              <h1>Release Requests</h1>
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
            {/* SEARCH */}
            <div className="search-bar-container">
              <Search size={18} className="search-bar-icon" />
              <input
                type="text"
                className="search-bar-input"
                placeholder="Search CIN, plate, violator, or location..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            {/* TABLE */}
            <div className="card">
              <div className="card-header-row">
                <div>
                  <p className="card-eyebrow">
                    Awaiting Action · Oldest first
                  </p>
                  <h2 className="card-title">Release Requests</h2>
                </div>
                <p className="request-total">
                  Pending Requests: <strong>{rows.length} total</strong>
                </p>
              </div>

              {loading ? (
                <div className="table-loading">
                  <p>Loading release requests...</p>
                </div>
              ) : paginated.length === 0 ? (
                <div className="table-empty">
                  <p>
                    {rows.length === 0
                      ? "No pending release requests."
                      : "No requests match the current search."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="table-wrapper" tabIndex={0} role="region" aria-label="Data table" data-scroll-region>
                    <table className="data-table request-table">
                      <thead>
                        <tr>
                          <th>Queue No.</th>
                          <th>CIN</th>
                          <th>Plate No.</th>
                          <th>Violator</th>
                          <th>Vehicle Type</th>
                          <th>Location</th>
                          <th>Amount Paid</th>
                          <th>Waiting</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginated.map((row) => (
                          <tr key={row.id}>
                            <td className="cell-queue">{row.queue}</td>
                            <td>
                              <span className="cin-pill">{row.cin}</span>
                            </td>
                            <td className="cell-plate">{row.plateNo}</td>

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

                            <td className="cell-vehicle">{row.vehicleType}</td>
                            <td className="cell-location">{row.location}</td>
                            <td className="cell-amount">
                              {formatCurrency(row.amountPaid)}
                            </td>
                            <td className="cell-waiting">
                              {formatWaiting(row.waitingMinutes)}
                            </td>
                            <td className="cell-actions">
                              <button
                                type="button"
                                className="btn-approve"
                                onClick={() => handleApprove(row)}
                                disabled={actioning === row.id}
                              >
                                {actioning === row.id ? "..." : "Approve"}
                              </button>
                              <button
                                type="button"
                                className="btn-reject"
                                onClick={() => handleReject(row)}
                                disabled={actioning === row.id}
                              >
                                {actioning === row.id ? "..." : "Reject"}
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
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
                      disabled={currentPage === totalPages}
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
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