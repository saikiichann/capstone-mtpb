import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Search, ChevronDown, X, MoreHorizontal } from "lucide-react";
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
import "./AllViolations.css";

// Asset imports
import mtpbLogo from "../../assets/mtpb-logo.png";
import officerAvatar from "../../assets/user.png";
import overviewIcon from "../../assets/overview.png";
import queueMonitorIcon from "../../assets/queue.png";
import allViolationsIcon from "../../assets/allviolations.png";
import clampingIcon from "../../assets/clamping.png";
import impoundingLogIcon from "../../assets/impounding.png";
import vehicleHistoryIcon from "../../assets/history.png";
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

type ViolationStatus =
  | "Pending Settlement"
  | "Settled"
  | "For Release"
  | "Disputed";

type ViolationRow = {
  id: string;
  cin: string;
  plateNo: string;
  violationType: string;
  location: string;
  fine: number;
  status: ViolationStatus;
  recordedAt: Timestamp | null;
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

const STATUS_FILTER_OPTIONS = ["All Status", ...STATUS_OPTIONS];

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Dashboard",
    items: [
      { label: "Overview", icon: overviewIcon, path: "/record-officer" },
      { label: "Queue Monitor", icon: queueMonitorIcon, path: "/record-officer/queue" },
    ],
  },
  {
    label: "Enforcement",
    items: [
      { label: "All Violations", icon: allViolationsIcon, path: "/record-officer/violations", active: true },
      { label: "Clamping Log", icon: clampingIcon, path: "/record-officer/clamping" },
      { label: "Impounding Log", icon: impoundingLogIcon, path: "/record-officer/impounding" },
      { label: "Vehicle History", icon: vehicleHistoryIcon, path: "/record-officer/vehicle-history" },
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

const formatCurrency = (amount: number): string => {
  return `₱${amount.toLocaleString("en-US")}`;
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
  const [plateNo, setPlateNo] = useState(row.plateNo);
  const [location, setLocation] = useState(row.location);
  const [fine, setFine] = useState(String(row.fine));
  const [violationType, setViolationType] = useState(row.violationType);
  const [status, setStatus] = useState<ViolationStatus>(row.status);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setError("");

    if (!plateNo.trim() || !location.trim() || !violationType.trim()) {
      setError("Please fill in all required fields.");
      return;
    }

    const parsedFine = parseInt(fine, 10);
    if (isNaN(parsedFine) || parsedFine < 0) {
      setError("Fine amount must be a valid number.");
      return;
    }

    if (status !== row.status && !reason.trim()) {
      setError("Amendment reason is required when changing the status.");
      return;
    }

    setSaving(true);

    try {
      const rowRef = doc(db, "violations", row.id);

      await updateDoc(rowRef, {
        plateNo: plateNo.trim(),
        location: location.trim(),
        fineAmount: parsedFine,   // ✅ FIXED: was "fine"
        violationType: violationType.trim(),
        status,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.name,
      });

      await addDoc(collection(db, "auditLogs"), {
        userName: currentUser.name,
        action: `updated violation ${row.cin} (status: ${row.status} → ${status})`,
        record: row.cin,
        type: "violation",
        metadata: {
          cin: row.cin,
          oldStatus: row.status,
          newStatus: status,
          reason: reason.trim() || "no reason provided",
        },
        timestamp: serverTimestamp(),
      });

      console.log("Violation updated:", row.cin);
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
                value={plateNo}
                onChange={(e) => setPlateNo(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="form-field">
              <label htmlFor="edit-location">Location</label>
              <input
                id="edit-location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="edit-fine">Fine Amount (₱)</label>
              <input
                id="edit-fine"
                type="number"
                value={fine}
                onChange={(e) => setFine(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="form-field">
              <label htmlFor="edit-violation">Violation Type</label>
              <input
                id="edit-violation"
                type="text"
                value={violationType}
                onChange={(e) => setViolationType(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="edit-time">Time</label>
              <input
                id="edit-time"
                type="text"
                value={formatDateTime(row.recordedAt)}
                readOnly
                style={{ background: "#F3F4F6", cursor: "not-allowed", color: "#6B7280" }}
              />
            </div>
            <div className="form-field">
              <label htmlFor="edit-status">Status Override</label>
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
          </div>

          <div className="form-field">
            <label htmlFor="edit-reason">
              Amendment reason {status !== row.status && <span className="required">(required for audit)</span>}
            </label>
            <textarea
              id="edit-reason"
              placeholder="Describe the reason for this change..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={saving}
              rows={4}
            />
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
// MAIN COMPONENT
// ---------------------------------------------------------------------------
export default function AllViolations() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "record-officer",
  });

  const [violations, setViolations] = useState<ViolationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All Status");
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
        const rows: ViolationRow[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            cin: data.cin ?? "—",
            plateNo: data.plateNo ?? "—",
            violationType: data.violationType ?? "—",
            location: data.location ?? "—",
            fine: Number(data.fineAmount ?? 0),   // ✅ FIXED: was "data.fine"
            status: (data.status ?? "Pending Settlement") as ViolationStatus,
            recordedAt: data.recordedAt ?? null,
          };
        });
        setViolations(rows);
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

  // -----------------------------------------------------------------------
  // FILTER VIOLATIONS
  // -----------------------------------------------------------------------
  const filteredViolations = violations.filter((v) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      v.cin.toLowerCase().includes(q) ||
      v.plateNo.toLowerCase().includes(q);

    const matchesStatus =
      statusFilter === "All Status" || v.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

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
              <h1>All Violations</h1>
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
            {/* TOOLBAR */}
            <div className="violations-toolbar">
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search CIN, Plate No..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <Search size={18} className="search-icon" />
              </div>

              <div className="filter-box">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  {STATUS_FILTER_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="filter-icon" />
              </div>
            </div>

            {/* VIOLATIONS TABLE */}
            <div className="card">
              {loading ? (
                <div className="table-loading">
                  <p>Loading violations...</p>
                </div>
              ) : filteredViolations.length === 0 ? (
                <div className="table-empty">
                  <p>No violations found.</p>
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
                        <th>Fine</th>
                        <th>Status</th>
                        <th>Recorded</th>
                        <th aria-label="Actions"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredViolations.map((row) => (
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
                          <td className="cell-fine">{formatCurrency(row.fine)}</td>
                          <td>
                            <span className={`status-pill ${getStatusClass(row.status)}`}>
                              {row.status}
                            </span>
                          </td>
                          <td className="cell-recorded">
                            {formatDateTime(row.recordedAt)}
                          </td>
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