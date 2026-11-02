import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, X, ChevronLeft, ChevronRight } from "lucide-react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./ActiveImpounding.css";

// Assets
import mtpbLogo from "../../assets/mtpb-logo.png";
import officerAvatar from "../../assets/user.png";
import overviewIcon from "../../assets/overview.png";
import impoundingLogIcon from "../../assets/impounding.png";
import activeImpoundingIcon from "../../assets/tow-truck.png";
import fieldUpdatesIcon from "../../assets/fieldupdate.png";
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

type CurrentUser = {
  name: string;
  role: RoleSlug;
};

type ImpoundStatus =
  | "Scheduled for Impounding"
  | "Subject to Impound"
  | "Impounded"
  | "Released"
  | "On Patrol";

type ImpoundRow = {
  id: string;
  cin: string;
  plateNo: string;
  location: string;
  clampedBy: string;
  clampedAt: Timestamp | null;
  hoursOverdue: number;
  status: ImpoundStatus;
};

type Metrics = {
  subjectToImpound: number;
  scheduled: number;
  avgHoursOverdue: number;
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

const STATUS_OPTIONS: ImpoundStatus[] = [
  "On Patrol",
  "Scheduled for Impounding",
  "Subject to Impound",
  "Impounded",
  "Released",
];

const navGroups: NavGroup[] = [
  {
    label: "Dashboard",
    items: [
      { label: "Overview", icon: overviewIcon, path: "/impounding-staff" },
    ],
  },
  {
    label: "Enforcement",
    items: [
      {
        label: "Impounding Log",
        icon: impoundingLogIcon,
        path: "/impounding-staff/log",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Active Impounding",
        icon: activeImpoundingIcon,
        path: "/impounding-staff/active",
        active: true,
      },
      {
        label: "Field Updates",
        icon: fieldUpdatesIcon,
        path: "/impounding-staff/field-updates",
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

const computeHoursOverdue = (ts: Timestamp | null): number => {
  if (!ts) return 0;
  try {
    const date = ts.toDate();
    const now = new Date();
    return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 3600000));
  } catch {
    return 0;
  }
};

const getStatusClass = (status: ImpoundStatus): string => {
  const map: Record<ImpoundStatus, string> = {
    "Scheduled for Impounding": "status-scheduled",
    "Subject to Impound": "status-subject",
    Impounded: "status-impounded",
    Released: "status-released",
    "On Patrol": "status-patrol",
  };
  return map[status] ?? "";
};

/* ------------------------------------------------------------------
   UPDATE MODAL
------------------------------------------------------------------ */
type UpdateModalProps = {
  row: ImpoundRow;
  onClose: () => void;
  onSave: (newStatus: ImpoundStatus) => Promise<void>;
};

function UpdateModal({ row, onClose, onSave }: UpdateModalProps) {
  const [newStatus, setNewStatus] = useState<ImpoundStatus>(row.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      await onSave(newStatus);
    } catch (err: any) {
      console.error("Update error:", err);
      setError(err.message || "Failed to update status.");
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={saving ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{row.cin}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="info-box">
            <div className="info-row">
              <span className="info-label">Plate:</span>
              <span className="info-value">{row.plateNo}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Officer:</span>
              <span className="info-value">{row.clampedBy}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Location:</span>
              <span className="info-value">{row.location}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Clamped:</span>
              <span className="info-value">
                {formatDateTime(row.clampedAt)}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Hours past redemption window:</span>
              <span className="info-value">{row.hoursOverdue} hrs</span>
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="update-status">Update Status</label>
            <select
              id="update-status"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as ImpoundStatus)}
              disabled={saving}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="modal-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-cancel"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-save"
            onClick={handleSave}
            disabled={saving || newStatus === row.status}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   MAIN COMPONENT
------------------------------------------------------------------ */
export default function ActiveImpounding() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "impounding-staff",
  });

  const [rows, setRows] = useState<ImpoundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRow, setSelectedRow] = useState<ImpoundRow | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  /* Fetch current user */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) {
        setCurrentUser({ name: "Guest", role: "impounding-staff" });
        return;
      }
      try {
        const userDocRef = doc(db, "users", loggedUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          setCurrentUser({
            name: data.name ?? "Unknown",
            role: (data.role ?? "impounding-staff") as RoleSlug,
          });
        } else {
          setCurrentUser({
            name: loggedUser.email?.split("@")[0] ?? "Unknown",
            role: "impounding-staff",
          });
        }
      } catch (err) {
        console.error("Error fetching current user:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  /**
   * Fetch impound records — active ones only (not Released).
   *
   * No orderBy() on purpose: Firestore silently drops documents that lack
   * the ordered field, so a record without clampedAt would never show up.
   * Newest-first sorting happens client-side instead.
   */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "impoundRecords"),
      (snap) => {
        const activeRows: ImpoundRow[] = snap.docs
          .map((d) => {
            const data = d.data();
            const clampedAt: Timestamp | null = data.clampedAt ?? null;
            const hoursOverdue: number =
              typeof data.hoursOverdue === "number"
                ? data.hoursOverdue
                : computeHoursOverdue(clampedAt);

            return {
              id: d.id,
              cin: data.cin ?? "—",
              plateNo: data.plateNo ?? "—",
              location: data.location ?? "—",
              clampedBy: data.clampedBy ?? "—",
              clampedAt,
              hoursOverdue,
              status: (data.status ?? "Subject to Impound") as ImpoundStatus,
            };
          })
          .filter((r) => r.status !== "Released")
          .sort((a, b) => millis(b.clampedAt) - millis(a.clampedAt));

        setRows(activeRows);
        setLoading(false);
      },
      (err) => {
        console.warn("Active impound fetch failed:", err.code);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  /* Click outside dropdown */
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

  /* Escape key for modal */
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && selectedRow) {
        setSelectedRow(null);
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [selectedRow]);

  /* Metrics are derived from all active rows, not just the visible page */
  const metrics: Metrics = useMemo(() => {
    let subject = 0;
    let scheduled = 0;
    let totalHours = 0;

    rows.forEach((row) => {
      if (row.status === "Subject to Impound") subject++;
      if (row.status === "Scheduled for Impounding") scheduled++;
      totalHours += row.hoursOverdue;
    });

    return {
      subjectToImpound: subject,
      scheduled,
      avgHoursOverdue: rows.length > 0 ? Math.round(totalHours / rows.length) : 0,
    };
  }, [rows]);

  /* Pagination */
  const totalPages = Math.max(1, Math.ceil(rows.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = rows.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const handleLogout = async () => {
    try {
      await firebaseSignOut(auth);
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      sessionStorage.clear();
      setIsMenuOpen(false);
      navigate("/");
    } catch (err) {
      console.error("Logout error:", err);
      setIsMenuOpen(false);
      navigate("/");
    }
  };

  const handleChangePassword = () => {
    console.log("Navigating to Change Password...");
    setIsMenuOpen(false);
  };

  /* Update status in Firestore */
  const handleUpdateStatus = async (newStatus: ImpoundStatus) => {
    if (!selectedRow) return;

    const previousStatus = selectedRow.status;
    const rowRef = doc(db, "impoundRecords", selectedRow.id);

    await updateDoc(rowRef, {
      status: newStatus,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.name,
    });

    await addDoc(collection(db, "auditLogs"), {
      userName: currentUser.name,
      action: `updated active impound ${selectedRow.cin} (${previousStatus} → ${newStatus})`,
      record: selectedRow.cin,
      type: "active-impound",
      metadata: {
        cin: selectedRow.cin,
        oldStatus: previousStatus,
        newStatus,
      },
      timestamp: serverTimestamp(),
    });

    console.log(`Updated ${selectedRow.cin}: ${previousStatus} → ${newStatus}`);
    setSelectedRow(null);
  };

  const metricCards = [
    {
      title: "Subject to impound",
      value: String(metrics.subjectToImpound),
      subtitle: "24-hr redemption window expired, unpaid",
    },
    {
      title: "Scheduled",
      value: String(metrics.scheduled),
      subtitle: "Queued for manual impounding",
    },
    {
      title: "Avg. hours overdue",
      value: `${metrics.avgHoursOverdue}h`,
      subtitle: "",
    },
  ];

  return (
    <div className="impounding-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <img src={mtpbLogo} alt="MTPB Logo" className="sidebar-logo-img" />
            <div>
              <p className="sidebar-brand-name">MTPB</p>
              <p className="sidebar-brand-role">Impounding Staff</p>
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
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* MAIN CONTENT */}
        <div className="main">
          <header className="main-header">
            <div>
              <h1>Active Impounding</h1>
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
                src={officerAvatar}
                alt="Staff Profile"
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
                  <button
                    className="dropdown-item"
                    onClick={handleChangePassword}
                  >
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
            {/* METRIC CARDS (3 columns) */}
            <div className="metric-grid-three">
              {metricCards.map((card) => (
                <div key={card.title} className="card metric-card">
                  <p className="metric-title">{card.title}</p>
                  <p className="metric-value">{card.value}</p>
                  {card.subtitle && (
                    <p className="metric-subtitle">{card.subtitle}</p>
                  )}
                </div>
              ))}
            </div>

            {/* ACTIVE IMPOUNDING OPERATIONS TABLE */}
            <div className="card active-card">
              <div className="active-header">
                <p className="card-eyebrow">Auto-flagged reminder</p>
                <h2 className="card-title">Active Impounding Operations</h2>
              </div>

              {loading ? (
                <div className="table-loading">
                  <p>Loading active operations...</p>
                </div>
              ) : rows.length === 0 ? (
                <div className="table-empty">
                  <p>No active impounding operations.</p>
                </div>
              ) : (
                <>
                  <div className="impound-table-wrapper">
                    <table className="impound-table">
                      <thead>
                        <tr>
                          <th>CIN</th>
                          <th>Plate No.</th>
                          <th>Location</th>
                          <th>Clamped by</th>
                          <th>Clamped</th>
                          <th>Hours Overdue</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedRows.map((row) => (
                          <tr
                            key={row.id}
                            onClick={() => setSelectedRow(row)}
                            className="impound-row-clickable"
                          >
                            <td>
                              <span className="cin-pill">{row.cin}</span>
                            </td>
                            <td className="cell-plate">{row.plateNo}</td>
                            <td className="cell-location">{row.location}</td>
                            <td className="cell-clamped-by">
                              {row.clampedBy}
                            </td>
                            <td className="cell-time">
                              {formatDateTime(row.clampedAt)}
                            </td>
                            <td className="cell-overdue">
                              {row.hoursOverdue}h
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

      {/* UPDATE MODAL */}
      {selectedRow && (
        <UpdateModal
          row={selectedRow}
          onClose={() => setSelectedRow(null)}
          onSave={handleUpdateStatus}
        />
      )}
    </div>
  );
}