import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  KeyRound,
  Search,
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
import "./ReleaseQueue.css";

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

type QueueRow = {
  id: string;
  cin: string;
  plateNo: string;
  vehicleType: string;
  location: string;
  readyAt: Timestamp | null;
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
        active: true,
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
const millis = (ts: Timestamp | null): number => {
  try {
    return ts ? ts.toMillis() : Number.MAX_SAFE_INTEGER;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
};

/** "Q-001", "Q-002"... position in the FIFO order, not a stored field —
 *  nothing in the schema keeps a queue number, so it's derived here from
 *  each row's rank after sorting by readyAt. */
const queueLabel = (position: number): string =>
  `Q-${String(position + 1).padStart(3, "0")}`;

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function ReleaseQueue() {
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "oic",
  });
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
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
   * Everything the OIC has approved but the Release Officer hasn't handed
   * over yet. FIFO by readyAt — the moment decideReleaseRequest() approved
   * it (lib/release.ts) — oldest first, same ordering principle as
   * buildQueue() uses elsewhere in this module.
   */
  useEffect(() => {
    const q = query(
      collection(db, "violations"),
      where("releaseStatus", "==", "Approved by OIC")
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const fetched: QueueRow[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              cin: data.cin ?? "—",
              plateNo: data.plateNo ?? "—",
              vehicleType: data.vehicleType ?? "—",
              location: data.location ?? "—",
              readyAt: (data.readyAt as Timestamp) ?? null,
            };
          })
          .sort((a, b) => millis(a.readyAt) - millis(b.readyAt));

        setRows(fetched);
        setLoading(false);
      },
      (err) => {
        console.warn("Release queue fetch failed:", err.code);
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

  /** Each row's queue label comes from its position in the FULL FIFO
   *  order, computed before search filtering — so Q-004 stays Q-004 even
   *  while a search narrows what's visible, instead of renumbering. */
  const labeledRows = useMemo(
    () => rows.map((row, i) => ({ ...row, queue: queueLabel(i) })),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return labeledRows;
    return labeledRows.filter(
      (row) =>
        row.queue.toLowerCase().includes(q) ||
        row.cin.toLowerCase().includes(q) ||
        row.plateNo.toLowerCase().includes(q) ||
        row.vehicleType.toLowerCase().includes(q) ||
        row.location.toLowerCase().includes(q)
    );
  }, [labeledRows, searchQuery]);

  /* Pagination */
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = filteredRows.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  return (
    <div className="oic-page release-queue-page">
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
              <h1>Release Queue</h1>
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
            {/* SEARCH */}
            <div className="search-bar-container">
              <Search size={18} className="search-bar-icon" />
              <input
                type="text"
                className="search-bar-input"
                placeholder="Search Queue No., CIN, Plate No..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* TABLE */}
            <div className="card release-queue-card">
              <p className="card-eyebrow">Release management · FIFO</p>
              <h2 className="card-title" style={{ marginBottom: 16 }}>
                Sector 3 Release Queue
              </h2>

              {loading ? (
                <div className="table-loading">
                  <p>Loading release queue...</p>
                </div>
              ) : paginatedRows.length === 0 ? (
                <div className="release-queue-empty">
                  {rows.length === 0
                    ? "No vehicles currently in the release queue."
                    : "No vehicles in the release queue match your search."}
                </div>
              ) : (
                <div className="release-queue-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Queue</th>
                        <th>CIN</th>
                        <th>Plate No.</th>
                        <th>Vehicle Type</th>
                        <th>Location</th>
                        <th>Status</th>
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
                          <td className="cell-type">{row.vehicleType}</td>
                          <td className="cell-location">{row.location}</td>
                          <td>
                            <span className="status-pill status-for-release">
                              For Release
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