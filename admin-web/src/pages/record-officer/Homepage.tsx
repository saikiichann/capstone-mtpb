import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, MoreHorizontal, ChevronDown, X } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./Homepage.css";

// Asset imports
import mtpbLogo from "../../assets/mtpb-logo.png";
import officerAvatar from "../../assets/user.png";
import overviewIcon from "../../assets/overview.png";
import queueMonitorIcon from "../../assets/queue.png";
import allViolationsIcon from "../../assets/allviolations.png";
import clampingIcon from "../../assets/clamping.png";
import impoundingIcon from "../../assets/impounding.png";
import historyIcon from "../../assets/history.png";
import releaseRequestsIcon from "../../assets/releaserequest.png";
import releaseOrdersIcon from "../../assets/releaseorder.png";
import releaseLogIcon from "../../assets/releaselog.png";
import allReportsIcon from "../../assets/reports.png";
import exportCenterIcon from "../../assets/export.png";
import logoutIcon from "../../assets/logout.png";

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

type ViolationStatus = "Disputed" | "Settled" | "Pending Settlement" | "For Release";

type ViolationRow = {
  id: string;
  cin: string;
  plateNo: string;
  violationType: string;
  location: string;
  status: ViolationStatus;
  recordedAt: Timestamp | null;
};

type Metrics = {
  totalRecords: number;
  pendingSettlement: number;
  disputedRecords: number;
  settledRecords: number;
};

type ViolationStat = {
  name: string;
  value: number;
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
const ROLE_LABELS: Record<RoleSlug, string> = {
  "oic": "Officer in Charge",
  "it-admin": "IT Admin",
  "supervisor": "Supervisor",
  "record-officer": "Record Officer",
  "release-officer": "Release Officer",
  "finance": "Finance Staff",
  "clamping-staff": "Clamping Staff",
  "impounding-staff": "Impounding Staff",
};

const STATUS_OPTIONS: ViolationStatus[] = [
  "Pending Settlement",
  "Settled",
  "For Release",
  "Disputed",
];

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Dashboard",
    items: [
      { label: "Overview", icon: overviewIcon, path: "/record-officer", active: true },
      { label: "Queue Monitor", icon: queueMonitorIcon, path: "/record-officer/queue" },
    ],
  },
  {
    label: "Enforcement",
    items: [
      { label: "All Violations", icon: allViolationsIcon, path: "/record-officer/violations" },
      { label: "Clamping Log", icon: clampingIcon, path: "/record-officer/clamping" },
      { label: "Impounding Log", icon: impoundingIcon, path: "/record-officer/impounding" },
      { label: "Vehicle History", icon: historyIcon, path: "/record-officer/history" },
    ],
  },
  {
    label: "Vehicle Release",
    items: [
      { label: "Release Requests", icon: releaseRequestsIcon, path: "/record-officer/release-requests" },
      { label: "Release Orders", icon: releaseOrdersIcon, path: "/record-officer/release-orders" },
      { label: "Release Log", icon: releaseLogIcon, path: "/record-officer/release-log" },
    ],
  },
  {
    label: "Reports",
    items: [
      { label: "All Reports", icon: allReportsIcon, path: "/record-officer/reports" },
      { label: "Export Center", icon: exportCenterIcon, path: "/record-officer/export" },
    ],
  },
];

const INITIAL_METRICS: Metrics = {
  totalRecords: 0,
  pendingSettlement: 0,
  disputedRecords: 0,
  settledRecords: 0,
};

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
const formatDateTime = (ts: Timestamp | null): string => {
  if (!ts) return "—";
  try {
    const date = ts.toDate();
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

const getStatusClass = (status: ViolationStatus): string => {
  const map: Record<ViolationStatus, string> = {
    "Settled": "status-settled",
    "Pending Settlement": "status-pending",
    "For Release": "status-release",
    "Disputed": "status-disputed",
  };
  return map[status] ?? "";
};

// ---------------------------------------------------------------------------
// EDIT MODAL
// ---------------------------------------------------------------------------
type EditModalProps = {
  row: ViolationRow;
  currentUser: CurrentUser;
  onClose: () => void;
  onSave: () => void;
};

function EditViolationModal({ row, currentUser, onClose, onSave }: EditModalProps) {
  const [status, setStatus] = useState<ViolationStatus>(row.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setError("");

    if (status === row.status) {
      onClose();
      return;
    }

    setSaving(true);

    try {
      const rowRef = doc(db, "violations", row.id);
      await updateDoc(rowRef, {
        status,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.name,
      });

      await addDoc(collection(db, "auditLogs"), {
        userName: currentUser.name,
        action: `updated violation ${row.cin} (${row.status} → ${status})`,
        record: row.cin,
        type: "violation",
        metadata: {
          cin: row.cin,
          oldStatus: row.status,
          newStatus: status,
        },
        timestamp: serverTimestamp(),
      });

      console.log(`Violation ${row.cin} updated.`);
      onSave();
    } catch (err: any) {
      console.error("Error updating violation:", err);
      if (err.code === "permission-denied") {
        setError("Permission denied. Please check your Firestore rules.");
      } else {
        setError(err.message || "Failed to update violation.");
      }
    } finally {
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
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="edit-plate">Plate Number</label>
              <input
                id="edit-plate"
                type="text"
                value={row.plateNo}
                readOnly
                style={{ background: "#F3F4F6", cursor: "not-allowed", color: "#6B7280" }}
              />
            </div>
            <div className="form-field">
              <label htmlFor="edit-violation">Violation</label>
              <input
                id="edit-violation"
                type="text"
                value={row.violationType}
                readOnly
                style={{ background: "#F3F4F6", cursor: "not-allowed", color: "#6B7280" }}
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="edit-location">Location</label>
            <input
              id="edit-location"
              type="text"
              value={row.location}
              readOnly
              style={{ background: "#F3F4F6", cursor: "not-allowed", color: "#6B7280" }}
            />
          </div>

          <div className="form-field">
            <label htmlFor="edit-status">Status</label>
            <div className="select-wrap">
              <select
                id="edit-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as ViolationStatus)}
                disabled={saving}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <ChevronDown size={16} className="select-icon" />
            </div>
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
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------
export default function RecordOfficerHomepage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "record-officer",
  });

  const [metrics, setMetrics] = useState<Metrics>(INITIAL_METRICS);
  const [recentRows, setRecentRows] = useState<ViolationRow[]>([]);
  const [topViolations, setTopViolations] = useState<ViolationStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRow, setSelectedRow] = useState<ViolationRow | null>(null);

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
  // EFFECT: Real-time listener for violations
  // -----------------------------------------------------------------------
  useEffect(() => {
    const ref = collection(db, "violations");
    const q = query(ref, orderBy("recordedAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const allRows: ViolationRow[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            cin: data.cin ?? "—",
            plateNo: data.plateNo ?? "—",
            violationType: data.violationType ?? "—",
            location: data.location ?? "—",
            status: (data.status ?? "Pending Settlement") as ViolationStatus,
            recordedAt: data.recordedAt ?? null,
          };
        });

        // Recent 5 for table
        setRecentRows(allRows.slice(0, 5));

        // Compute metrics
        const totalRecords = allRows.length;
        const pendingSettlement = allRows.filter(
          (r) => r.status === "Pending Settlement"
        ).length;
        const disputedRecords = allRows.filter(
          (r) => r.status === "Disputed"
        ).length;
        const settledRecords = allRows.filter(
          (r) => r.status === "Settled"
        ).length;

        setMetrics({
          totalRecords,
          pendingSettlement,
          disputedRecords,
          settledRecords,
        });

        // Compute top violations by type
        const typeMap: Record<string, number> = {};
        allRows.forEach((r) => {
          typeMap[r.violationType] = (typeMap[r.violationType] || 0) + 1;
        });

        const topArr: ViolationStat[] = Object.entries(typeMap)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5);

        setTopViolations(topArr);
        setLoading(false);
      },
      (err) => {
        console.warn("Violations fetch failed:", err.code);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // -----------------------------------------------------------------------
  // EFFECT: Click-outside for dropdown
  // -----------------------------------------------------------------------
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // -----------------------------------------------------------------------
  // EFFECT: Escape key for modal
  // -----------------------------------------------------------------------
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && selectedRow) {
        setSelectedRow(null);
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [selectedRow]);

  // -----------------------------------------------------------------------
  // HANDLERS
  // -----------------------------------------------------------------------
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

  const metricCards = [
    {
      title: "Total Records",
      value: String(metrics.totalRecords),
      subtitle: "Sector 3, on file",
    },
    {
      title: "Pending Settlement",
      value: String(metrics.pendingSettlement),
      subtitle: "Awaiting owner payment",
    },
    {
      title: "Disputed Records",
      value: String(metrics.disputedRecords),
      subtitle: "Flagged for review",
    },
    {
      title: "Settled Records",
      value: String(metrics.settledRecords),
      subtitle: "Closed, on file",
    },
  ];

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------
  return (
    <div className="record-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <img src={mtpbLogo} alt="MTPB Logo" className="sidebar-logo-img" />
            <div>
              <p className="sidebar-brand-name">MTPB</p>
              <p className="sidebar-brand-role">Record Officer</p>
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
                        className={`nav-item ${item.active ? "nav-item-active" : ""}`}
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
              <h1>Overview</h1>
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
                  <button className="dropdown-item" onClick={handleChangePassword}>
                    <KeyRound size={18} />
                    <span>Change Password</span>
                  </button>
                  <button className="dropdown-item logout" onClick={handleLogout}>
                    <img src={logoutIcon} alt="" className="dropdown-icon" />
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </div>
          </header>

          <main className="main-content">
            {/* METRIC CARDS */}
            <div className="metric-grid-four">
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

            {/* TOP VIOLATIONS CHART */}
            <div className="card">
              <p className="card-eyebrow">Sector 3</p>
              <h2 className="card-title">Top Violations</h2>

              {loading ? (
                <div className="table-loading">
                  <p>Loading chart...</p>
                </div>
              ) : topViolations.length === 0 ? (
                <div className="table-empty">
                  <p>No violation data available.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={topViolations}
                    layout="vertical"
                    margin={{ left: 40, right: 40 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke="#eee"
                    />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: "#9CA3AF" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 12, fill: "#374151" }}
                      axisLine={false}
                      tickLine={false}
                      width={120}
                    />
                    <Tooltip cursor={{ fill: "rgba(59, 130, 246, 0.08)" }} />
                    <Bar
                      dataKey="value"
                      fill="#5B8FF9"
                      radius={[0, 4, 4, 0]}
                      barSize={18}
                      label={{ position: "right", fontSize: 11, fill: "#374151" }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* RECENT VIOLATION RECORDS */}
            <div className="card">
              <div className="card-header-row">
                <div>
                  <p className="card-eyebrow">Sector 3 · Most recently logged</p>
                  <h2 className="card-title">Recent Violation Records</h2>
                </div>
                <a href="#view-all" className="card-link">View All</a>
              </div>

              {loading ? (
                <div className="table-loading">
                  <p>Loading records...</p>
                </div>
              ) : recentRows.length === 0 ? (
                <div className="table-empty">
                  <p>No violation records yet.</p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>CIN</th>
                        <th>Plate No.</th>
                        <th>Violation</th>
                        <th>Location</th>
                        <th>Status</th>
                        <th>Recorded</th>
                        <th aria-label="Actions"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentRows.map((row) => (
                        <tr
                          key={row.id}
                          onClick={() => setSelectedRow(row)}
                          className="violation-row-clickable"
                        >
                          <td>
                            <span className="cin-pill">{row.cin}</span>
                          </td>
                          <td className="cell-plate">{row.plateNo}</td>
                          <td className="cell-violation">{row.violationType}</td>
                          <td className="cell-location">{row.location}</td>
                          <td>
                            <span className={`status-pill ${getStatusClass(row.status)}`}>
                              {row.status}
                            </span>
                          </td>
                          <td className="cell-recorded">{formatDateTime(row.recordedAt)}</td>
                          <td className="cell-more">
                            <button
                              type="button"
                              className="row-more-btn"
                              aria-label="More options"
                            >
                              <MoreHorizontal size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* EDIT MODAL */}
      {selectedRow && (
        <EditViolationModal
          row={selectedRow}
          currentUser={currentUser}
          onClose={() => setSelectedRow(null)}
          onSave={() => setSelectedRow(null)}
        />
      )}
    </div>
  );
}