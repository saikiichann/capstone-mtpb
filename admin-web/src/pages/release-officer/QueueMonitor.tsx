import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, ChevronLeft, ChevronRight, Search } from "lucide-react";
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
import { NotificationBell } from "../../components/NotificationBell";
import {
  buildQueue,
  getQueueStatusClass,
  markViolationAsReleased,
  RELEASE_QUEUE_STATUS,
  type QueueRow,
} from "../../lib/release";
import "./QueueMonitor.css";

import mtpbLogo from "../../assets/mtpb-logo.png";
import officerAvatar from "../../assets/user.png";
import overviewIcon from "../../assets/overview.png";
import queueIcon from "../../assets/queue.png";
import releaseLogIcon from "../../assets/releaselog.png";
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

type CurrentUser = { name: string; role: RoleSlug };

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
  finance: "Finance",
  "clamping-staff": "Clamping Staff",
  "impounding-staff": "Impounding Staff",
};

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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "release-officer",
  });
  const [currentUserUid, setCurrentUserUid] = useState<string>("");

  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
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

  const handleMarkAsReleased = async (row: QueueRow) => {
    if (!row.canRelease) {
      alert(
        "Payment is not yet verified for this vehicle. It cannot be released."
      );
      return;
    }

    // FIFO guard: warn kung may nauunang verified na case sa queue.
    const firstReleasable = rows.find((r) => r.canRelease);
    if (firstReleasable && firstReleasable.id !== row.id) {
      const proceed = window.confirm(
        `FIFO order puts ${firstReleasable.cin} (${firstReleasable.queue}) ahead of ${row.cin}.\n\n` +
          `Releasing out of order breaks the First-In, First-Out rule. Continue anyway?`
      );
      if (!proceed) return;
    }

    if (
      !window.confirm(
        `Mark ${row.cin} as released?\n\nPlate: ${row.plateNo}\nLocation: ${row.location}\n\nThis will also reset the clamp to "available" for reuse.`
      )
    ) {
      return;
    }

    setActioning(row.id);
    try {
      await markViolationAsReleased({
        violationId: row.id,
        cin: row.cin,
        plateNo: row.plateNo,
        location: row.location,
        clampId: row.clampId,
        verifiedAt: row.verifiedAt,
        officerName: currentUser.name,
        totalPaid: row.totalPaid ?? 0, // ✅ FIX: idinagdag — kailangan ng lib/release.ts
      });
    } catch (err: any) {
      console.error("Release failed:", err);
      alert(err.message || "Failed to mark as released.");
    } finally {
      setActioning(null);
    }
  };

  /* Filter + Pagination */
  const filteredRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.cin.toLowerCase().includes(q) ||
        r.plateNo.toLowerCase().includes(q) ||
        r.location.toLowerCase().includes(q) ||
        r.queue.toLowerCase().includes(q)
    );
  }, [rows, searchQuery]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredRows.length / ITEMS_PER_PAGE)
  );
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = filteredRows.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  );

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  return (
    <div className="release-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <img src={mtpbLogo} alt="MTPB Logo" className="sidebar-logo-img" />
            <div>
              <p className="sidebar-brand-name">MTPB</p>
              <p className="sidebar-brand-role">Release Officer</p>
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

        {/* MAIN */}
        <div className="main">
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
                <NotificationBell currentUserUid={currentUserUid} />
              )}
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
            </div>
          </header>

          <main className="main-content">
            {/* SEARCH BAR */}
            <div className="queue-search-bar">
              <Search size={18} className="queue-search-icon" />
              <input
                type="text"
                className="queue-search-input"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
              />
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
                  <div className="table-wrapper">
                    <table className="data-table queue-table">
                      <thead>
                        <tr>
                          <th>Queue</th>
                          <th>CIN</th>
                          <th>Plate No.</th>
                          <th>Vehicle Type</th>
                          <th>Location</th>
                          <th>Waiting</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedRows.map((row) => (
                          <tr key={row.id}>
                            <td className="cell-queue">{row.queue}</td>
                            <td>
                              <span className="cin-pill">{row.cin}</span>
                            </td>
                            <td className="cell-plate">{row.plateNo}</td>
                            <td className="cell-vehicle">{row.vehicleType}</td>
                            <td className="cell-location">{row.location}</td>
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
                                className="btn-mark-released"
                                onClick={() => handleMarkAsReleased(row)}
                                disabled={
                                  actioning === row.id || !row.canRelease
                                }
                                title={
                                  row.canRelease
                                    ? "Mark as released"
                                    : "Payment not yet verified"
                                }
                              >
                                {actioning === row.id
                                  ? "Processing..."
                                  : "Mark as Released"}
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
    </div>
  );
}