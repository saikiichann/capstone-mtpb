import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  KeyRound,
  Bell,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./ReleaseLog.css";

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

type ReleaseLogRow = {
  id: string;
  orderId: string;
  plateNo: string;
  clearedBy: string;
  location: string;
  dateTime: Timestamp | null;
  totalFinePaid: number | null;
};

type NotificationType = "release-approved" | "release-denied";

type NotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: Timestamp | null;
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
  finance: "Finance",
  "clamping-staff": "Clamping Staff",
  "impounding-staff": "Impounding Staff",
};

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

const formatRelativeTime = (ts: Timestamp | null): string => {
  if (!ts) return "just now";
  try {
    const date = ts.toDate();
    const diffMs = new Date().getTime() - date.getTime();
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min${mins > 1 ? "s" : ""} ago`;
    if (hours < 24) return `${hours} hr${hours > 1 ? "s" : ""} ago`;
    return `${days} day${days > 1 ? "s" : ""} ago`;
  } catch {
    return "just now";
  }
};

/* ------------------------------------------------------------------
   NOTIFICATION BELL
------------------------------------------------------------------ */
function NotificationBell({ currentUserUid }: { currentUserUid: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentUserUid) return;
    const q = query(
      collection(db, "notifications"),
      where("recipientUid", "==", currentUserUid),
      orderBy("createdAt", "desc")
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setNotifications(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              type: (data.type ?? "release-approved") as NotificationType,
              title: data.title ?? "Notification",
              message: data.message ?? "",
              read: data.read ?? false,
              createdAt: data.createdAt ?? null,
            };
          })
        );
      },
      (err) => console.warn(err.code)
    );
    return () => unsubscribe();
  }, [currentUserUid]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, "notifications", id), {
        read: true,
        readAt: serverTimestamp(),
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="notification-bell-wrapper" ref={wrapperRef}>
      <button
        type="button"
        className="notification-bell-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Notifications (${unreadCount} unread)`}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="notification-empty">
                <Bell size={32} className="notification-empty-icon" />
                <p>No notifications yet</p>
              </div>
            ) : (
              notifications.slice(0, 10).map((n) => (
                <div
                  key={n.id}
                  className={`notification-item ${!n.read ? "unread" : ""}`}
                  onClick={() => markAsRead(n.id)}
                >
                  <div
                    className={`notification-icon ${
                      n.type === "release-approved"
                        ? "icon-approved"
                        : "icon-denied"
                    }`}
                  >
                    {n.type === "release-approved" ? (
                      <CheckCircle2 size={22} strokeWidth={2.5} />
                    ) : (
                      <XCircle size={22} strokeWidth={2.5} />
                    )}
                  </div>
                  <div className="notification-content">
                    <p className="notification-item-title">{n.title}</p>
                    <p className="notification-item-message">{n.message}</p>
                    <p className="notification-item-time">
                      {formatRelativeTime(n.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   MAIN COMPONENT
------------------------------------------------------------------ */
export default function ReleaseLog() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "release-officer",
  });
  const [currentUserUid, setCurrentUserUid] = useState<string>("");

  const [logs, setLogs] = useState<ReleaseLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Search + Pagination
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
              dateTime: data.releasedAt ?? null,
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
        console.warn(err.code);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  /* Click outside + Escape */
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
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
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
      console.error(err);
      setIsMenuOpen(false);
      navigate("/", { replace: true });
    }
  };

  /* Filter + Pagination */
  const filteredLogs = logs.filter((log) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      log.orderId.toLowerCase().includes(q) ||
      log.plateNo.toLowerCase().includes(q) ||
      log.clearedBy.toLowerCase().includes(q) ||
      log.location.toLowerCase().includes(q)
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
            <div className="log-search-bar">
              <Search size={18} className="log-search-icon" />
              <input
                type="text"
                className="log-search-input"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
              />
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
                  <div className="table-wrapper">
                    <table className="data-table release-log-table">
                      <thead>
                        <tr>
                          <th>Order ID</th>
                          <th>Plate No.</th>
                          <th>Cleared by</th>
                          <th>Location</th>
                          <th>Date &amp; Time</th>
                          <th>Total Fine Paid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedLogs.map((row) => (
                          <tr key={row.id}>
                            <td className="cell-order-id">{row.orderId}</td>
                            <td className="cell-plate">{row.plateNo}</td>
                            <td className="cell-cleared-by">
                              {row.clearedBy}
                            </td>
                            <td className="cell-location">
                              {row.location}
                            </td>
                            <td className="cell-datetime">
                              {formatDateTime(row.dateTime)}
                            </td>
                            <td className="cell-fine">
                              {formatCurrency(row.totalFinePaid)}
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
    </div>
  );
}