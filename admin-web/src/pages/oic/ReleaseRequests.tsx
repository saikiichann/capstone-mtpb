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
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import {
  AWAITING_OIC_STATUS,
  decideReleaseRequest,
  queueSortKey,
  computeWaitingMinutes,
} from "../../lib/release";
import "./ReleaseRequests.css";

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

/**
 * Kapareho ng sidebar ng OIC Homepage — pareho ang assets at pareho ang
 * paths. Kung may babaguhin sa isa, dapat pareho silang baguhin.
 */
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
      { label: "Geospatial Heatmap", icon: mapIcon, path: "/dashboard/heatmap" },
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
        active: true,
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
export default function ReleaseRequests() {
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "oic",
  });
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [rows, setRows] = useState<ReleaseRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
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

  useEffect(() => {
    const q = query(
      collection(db, "violations"),
      where("releaseStatus", "==", AWAITING_OIC_STATUS)
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

  const handleApprove = async (row: ReleaseRequestRow) => {
    // FIFO guard — pareho ng nasa release queue.
    if (rows.length > 0 && rows[0].id !== row.id) {
      const proceed = window.confirm(
        `FIFO order puts ${rows[0].cin} (${rows[0].queue}) ahead of ${row.cin}.\n\n` +
          `Approving out of order breaks the First-In, First-Out rule. Continue anyway?`
      );
      if (!proceed) return;
    }

    if (
      !window.confirm(
        `Approve release for ${row.cin}?\n\nPlate: ${row.plateNo}\nVehicle: ${row.vehicleType}\nAmount paid: ${formatCurrency(
          row.amountPaid
        )}\n\nThis sends the vehicle to the Release Officer's queue.`
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
      });
    } catch (err: any) {
      console.error("Approve failed:", err);
      alert(err.message || "Failed to approve the release request.");
    } finally {
      setActioning(null);
    }
  };

  const handleReject = async (row: ReleaseRequestRow) => {
    const reason = window.prompt(
      `Reject release for ${row.cin}?\n\nEnter the reason — this is recorded against the case and the violator has already paid, so the ground for refusal needs to be on file:`
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
      });
    } catch (err: any) {
      console.error("Reject failed:", err);
      alert(err.message || "Failed to reject the release request.");
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
        r.queue.toLowerCase().includes(q)
    );
  }, [rows, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  /* ----------------------------------------------------------------
     RENDER
  ---------------------------------------------------------------- */
  return (
    <div className="oic-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <img src={logo} alt="MTPB logo" className="sidebar-logo-img" />
            <div>
              <p className="sidebar-brand-name">MTPB</p>
              <p className="sidebar-brand-role">Officer in Charge</p>
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
              <h1>Release Requests</h1>
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
                placeholder="Search CIN, plate, or location..."
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
                  <div className="table-wrapper">
                    <table className="data-table request-table">
                      <thead>
                        <tr>
                          <th>Queue No.</th>
                          <th>CIN</th>
                          <th>Plate No.</th>
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