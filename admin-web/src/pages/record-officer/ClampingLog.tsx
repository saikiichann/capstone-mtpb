import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, MoreHorizontal, X } from "lucide-react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./ClampingLog.css";

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

// UI displays "Clamped" / "Removed", but DB might store "Active" / "Released"
type ClampStatus = "Active" | "Released" | "Impounded";

type ClampingRow = {
  id: string;
  cin: string;
  plateNo: string;
  vehicleType: string;
  location: string;
  clampedBy: string;
  clampedAt: Timestamp | null;
  status: ClampStatus;
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
      { label: "All Violations", icon: allViolationsIcon, path: "/record-officer/violations" },
      { label: "Clamping Log", icon: clampingIcon, path: "/record-officer/clamping", active: true },
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

// Maps internal DB status to UI display label for the table
const getStatusLabel = (status: ClampStatus): string => {
  if (status === "Active") return "Clamped";
  if (status === "Released") return "Removed";
  return status;
};

const getStatusClass = (status: ClampStatus): string => {
  const map: Record<ClampStatus, string> = {
    "Active": "status-active-clamp",
    "Released": "status-released-clamp",
    "Impounded": "status-impounded-clamp",
  };
  return map[status] ?? "";
};

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------
export default function ClampingLog() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "record-officer",
  });

  const [rows, setRows] = useState<ClampingRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ClampingRow | null>(null);

  // Form State for Modal
  const [formData, setFormData] = useState({
    plateNo: "",
    vehicleType: "",
    fineAmount: "₱500",
    violationType: "Sidewalk Parking",
    officer: "",
    location: "",
    time: "",
    status: "Active" as ClampStatus,
  });

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
  // EFFECT: Real-time listener for clamping records
  // -----------------------------------------------------------------------
  useEffect(() => {
    const ref = collection(db, "clampingRecords");
    const q = query(ref, orderBy("clampedAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const fetched: ClampingRow[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            cin: data.cin ?? "—",
            plateNo: data.plateNo ?? "—",
            vehicleType: data.vehicleType ?? "—",
            location: data.location ?? "—",
            clampedBy: data.clampedBy ?? "—",
            clampedAt: data.clampedAt ?? null,
            status: (data.status ?? "Active") as ClampStatus,
          };
        });
        setRows(fetched);
        setLoading(false);
      },
      (err) => {
        console.warn("Clamping records fetch failed:", err.code);
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

  const handleOpenEditModal = (row: ClampingRow) => {
    setSelectedRow(row);
    setFormData({
      plateNo: row.plateNo,
      vehicleType: row.vehicleType,
      fineAmount: "₱500", // Placeholder: Replace with actual data from row if available
      violationType: "Sidewalk Parking", // Placeholder: Replace with actual data from row if available
      officer: row.clampedBy,
      location: row.location,
      time: formatDateTime(row.clampedAt),
      status: row.status,
    });
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setSelectedRow(null);
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveChanges = () => {
    // TODO: Implement Firebase update logic here
    console.log("Saving changes for CIN:", selectedRow?.cin, formData);
    // After saving, close the modal and optionally refetch or rely on onSnapshot
    handleCloseEditModal();
  };

  // Map UI Status to Database Status for the Dropdown
  const getDropdownValue = (status: ClampStatus) => {
    if (status === "Active") return "Clamped";
    if (status === "Released") return "Removed";
    return status;
  };

  const getStatusFromDropdown = (value: string): ClampStatus => {
    if (value === "Clamped") return "Active";
    if (value === "Removed") return "Released";
    return "Impounded";
  };

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
              <h1>Clamping Log</h1>
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
            <div className="card">
              <p className="card-eyebrow">Sector 3 · Clamping history</p>
              <h2 className="card-title">Clamping Log</h2>

              {loading ? (
                <div className="table-loading">
                  <p>Loading clamping records...</p>
                </div>
              ) : rows.length === 0 ? (
                <div className="table-empty">
                  <p>No clamping records found.</p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>CIN</th>
                        <th>Plate No.</th>
                        <th>Vehicle Type</th>
                        <th>Location</th>
                        <th>Officer</th>
                        <th>Time</th>
                        <th>Status</th>
                        <th aria-label="Actions"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <span className="cin-pill">{row.cin}</span>
                          </td>
                          <td className="cell-plate">{row.plateNo}</td>
                          <td className="cell-vehicle-type">{row.vehicleType}</td>
                          <td className="cell-location">{row.location}</td>
                          <td className="cell-clamped-by">{row.clampedBy}</td>
                          <td className="cell-datetime">{formatDateTime(row.clampedAt)}</td>
                          <td>
                            <span className={`status-pill ${getStatusClass(row.status)}`}>
                              {getStatusLabel(row.status)}
                            </span>
                          </td>
                          <td className="cell-more">
                            <button
                              type="button"
                              className="row-more-btn"
                              aria-label="More options"
                              onClick={() => handleOpenEditModal(row)}
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
      {isEditModalOpen && selectedRow && (
        <div className="modal-overlay" onClick={handleCloseEditModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{selectedRow.cin}</h3>
              <button className="modal-close-btn" onClick={handleCloseEditModal}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-grid">
              <div className="form-group">
                <label htmlFor="plateNo">Plate Number</label>
                <input
                  id="plateNo"
                  name="plateNo"
                  type="text"
                  className="form-input"
                  value={formData.plateNo}
                  onChange={handleFormChange}
                />
              </div>

              <div className="form-group">
                <label htmlFor="vehicleType">Vehicle Type</label>
                <input
                  id="vehicleType"
                  name="vehicleType"
                  type="text"
                  className="form-input"
                  value={formData.vehicleType}
                  onChange={handleFormChange}
                />
              </div>

              <div className="form-group">
                <label htmlFor="fineAmount">Fine Amount (₱)</label>
                <input
                  id="fineAmount"
                  name="fineAmount"
                  type="text"
                  className="form-input"
                  value={formData.fineAmount}
                  onChange={handleFormChange}
                />
              </div>

              <div className="form-group">
                <label htmlFor="violationType">Violation Type</label>
                <input
                  id="violationType"
                  name="violationType"
                  type="text"
                  className="form-input"
                  value={formData.violationType}
                  onChange={handleFormChange}
                />
              </div>

              <div className="form-group">
                <label htmlFor="officer">Officer</label>
                <input
                  id="officer"
                  name="officer"
                  type="text"
                  className="form-input"
                  value={formData.officer}
                  onChange={handleFormChange}
                />
              </div>

              <div className="form-group">
                <label htmlFor="location">Location</label>
                <input
                  id="location"
                  name="location"
                  type="text"
                  className="form-input"
                  value={formData.location}
                  onChange={handleFormChange}
                />
              </div>

              <div className="form-group">
                <label htmlFor="time">Time</label>
                <input
                  id="time"
                  name="time"
                  type="text"
                  className="form-input"
                  value={formData.time}
                  onChange={handleFormChange}
                />
              </div>

              <div className="form-group">
                <label htmlFor="status">Status</label>
                <select
                  id="status"
                  name="status"
                  className="form-select"
                  value={getDropdownValue(formData.status)}
                  onChange={(e) => {
                    const newStatus = getStatusFromDropdown(e.target.value);
                    setFormData((prev) => ({ ...prev, status: newStatus }));
                  }}
                >
                  <option value="Clamped">Clamped</option>
                  <option value="Removed">Removed</option>
                </select>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={handleCloseEditModal}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSaveChanges}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}