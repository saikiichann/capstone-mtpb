import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, Search, PanelRightOpen } from "lucide-react";
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
import { NotificationBell } from "../../components/NotificationBell";
import {
  buildQueue,
  getQueueStatusClass,
  RELEASE_QUEUE_STATUS,
  type QueueRow,
} from "../../lib/release";
import ReleaseDetailsDrawer from "../../components/ReleaseDetailsDrawer";
import { confirmAndRelease } from "../../lib/releaseFlow";
import "./QueueMonitor.css";

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

type NavItem = { label: string; icon: string; path: string; active?: boolean };
type NavGroup = { label: string; items: NavItem[] };

/* ------------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------------ */
const ITEMS_PER_PAGE = 10;


const NAV_GROUPS: NavGroup[] = [
  {
    label: "Dashboard",
    items: [{ label: "Overview", icon: overviewIcon, path: "/release-officer" }],
  },
  {
    label: "Vehicle Release",
    items: [
      {
        label: "Release Queue",
        icon: queueIcon,
        path: "/release-officer/queue",
        active: true,
      },
      {
        label: "Release Log",
        icon: releaseLogIcon,
        path: "/release-officer/log",
      },
    ],
  },
];

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function QueueMonitor() {

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "release-officer",
  });
  const [currentUserUid, setCurrentUserUid] = useState<string>("");

  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  /** The vehicle open in the Release Details panel */
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [districtFilter, setDistrictFilter] = useState("All Districts");
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
        console.error("Failed to load current user:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  /* Queue — only OIC-approved violations reach the release officer */
  useEffect(() => {
    const q = query(
      collection(db, "violations"),
      where("releaseStatus", "==", RELEASE_QUEUE_STATUS)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setRows(buildQueue(snap.docs));
        setLoading(false);
      },
      (err) => {
        console.warn("Queue fetch failed:", err.code);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  /** Release from the details panel: same checks as before (lib/releaseFlow.ts). */
  const handleRelease = async (violationId: string) => {
    try {
      const outcome = await confirmAndRelease({ violationId, officerName: currentUser.name });
      if (outcome === "released" || outcome === "already-released") setSelectedId(null);
    } catch (err) {
      console.error("Release failed:", err);
      alert((err as Error)?.message || "Failed to mark as released.");
    }
  };

  /* District filter — Release Officers are assigned per district */
  const districtOptions = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r) => r.details.district).filter((d): d is string => !!d))
      ).sort(),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return rows.filter((r) => {
      if (districtFilter !== "All Districts" && r.details.district !== districtFilter) {
        return false;
      }
      if (!q) return true;
      return (
        r.cin.toLowerCase().includes(q) ||
        r.plateNo.toLowerCase().includes(q) ||
        r.location.toLowerCase().includes(q) ||
        r.details.exact.toLowerCase().includes(q) ||
        (r.details.barangay ?? "").toLowerCase().includes(q) ||
        r.queue.toLowerCase().includes(q)
      );
    });
  }, [rows, searchQuery, districtFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredRows.length / ITEMS_PER_PAGE)
  );
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = filteredRows.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  );

  // Keep the page valid if the list shrinks (during render)
  if (currentPage > totalPages) setCurrentPage(totalPages);

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
              <h1>Release Queue</h1>
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
              <div className="queue-search-bar">
                <Search size={18} className="queue-search-icon" />
                <input
                  type="text"
                  className="queue-search-input"
                  placeholder="Search CIN, plate, street or barangay..."
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
              <p className="card-eyebrow">Release Management · FIFO</p>
              <h2 className="card-title">Sector 3 Release Queue</h2>

              {loading ? (
                <div className="table-loading">
                  <p>Loading queue...</p>
                </div>
              ) : paginatedRows.length === 0 ? (
                <div className="table-empty">
                  <p>No vehicles in queue.</p>
                </div>
              ) : (
                <>
                  <div className="table-wrapper" tabIndex={0} role="region" aria-label="Data table" data-scroll-region>
                    <table className="data-table queue-table">
                      <thead>
                        <tr>
                          <th>Queue</th>
                          <th>CIN</th>
                          <th>Plate No.</th>
                          <th>District</th>
                          <th>Waiting</th>
                          <th>Status</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedRows.map((row) => (
                          <tr
                            key={row.id}
                            className="rd-row"
                            onClick={() => setSelectedId(row.id)}
                          >
                            <td className="cell-queue">{row.queue}</td>
                            <td>
                              <span className="cin-pill">{row.cin}</span>
                            </td>
                            <td className="cell-plate">{row.plateNo}</td>
                            <td>
                              {row.details.district ? (
                                <span className="district-pill">{row.details.district}</span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="cell-waiting">
                              {row.waitingMinutes} min
                            </td>
                            <td>
                              <span
                                className={`status-pill ${getQueueStatusClass(
                                  row.status
                                )}`}
                              >
                                {row.status}
                              </span>
                            </td>
                            <td className="cell-action">
                              <button
                                type="button"
                                className="rd-view-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedId(row.id);
                                }}
                              >
                                <PanelRightOpen size={15} />
                                View &amp; Release
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
      {selectedId && (
        <ReleaseDetailsDrawer
          violationId={selectedId}
          onClose={() => setSelectedId(null)}
          onRelease={handleRelease}
        />
      )}
    </div>
  );
}