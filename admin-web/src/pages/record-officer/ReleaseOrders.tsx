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
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./ReleaseOrders.css";

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

type OrderStatus = "Completed" | "Cancelled";

type ReleaseOrderRow = {
  id: string;
  orderId: string;
  cin: string;
  plateNo: string;
  approvedBy: string;
  dateTime: string;
  status: OrderStatus;
  // Extra fields for the preview (optional in Firestore, with fallbacks)
  vehicleType?: string;
  sector?: string;
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
      { label: "Clamping Log", icon: clampingIcon, path: "/record-officer/clamping" },
      { label: "Impounding Log", icon: impoundingLogIcon, path: "/record-officer/impounding" },
      { label: "Vehicle History", icon: vehicleHistoryIcon, path: "/record-officer/vehicle-history" },
    ],
  },
  {
    label: "Vehicle Release",
    items: [
      { label: "Release Requests", icon: releaseRequestsIcon, path: "/record-officer/release-requests" },
      { label: "Release Orders", icon: releaseOrdersIcon, path: "/record-officer/release-orders", active: true },
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
const getStatusClass = (status: OrderStatus): string => {
  const map: Record<OrderStatus, string> = {
    "Completed": "status-completed-pill",
    "Cancelled": "status-cancelled-pill",
  };
  return map[status] ?? "";
};

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------
export default function ReleaseOrders() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "record-officer",
  });

  const [rows, setRows] = useState<ReleaseOrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ReleaseOrderRow | null>(null);

  // Form State for Modal
  const [formData, setFormData] = useState({
    issuedBy: "S. Bautista — OIC",
    remarks: "",
    outputFormat: "PDF (for printing)",
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
  // EFFECT: Real-time listener for release orders
  // -----------------------------------------------------------------------
  useEffect(() => {
    const ref = collection(db, "releaseOrders");
    const q = query(ref, orderBy("approvedAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const fetched: ReleaseOrderRow[] = snap.docs.map((d) => {
          const data = d.data();

          // Format the date/time nicely
          let dateTime = "—";
          if (data.approvedAt) {
            try {
              const date = data.approvedAt.toDate
                ? data.approvedAt.toDate()
                : new Date(data.approvedAt);
              dateTime = date.toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              }).replace(",", ",").replace(":", ":");
            } catch {
              dateTime = "—";
            }
          }

          return {
            id: d.id,
            orderId: data.orderId ?? "—",
            cin: data.cin ?? "—",
            plateNo: data.plateNo ?? "—",
            approvedBy: data.approvedBy ?? "Finance Staff",
            dateTime,
            status: (data.status ?? "Completed") as OrderStatus,
            vehicleType: data.vehicleType ?? "—",
            sector: data.sector ?? "Sector 1",
          };
        });
        setRows(fetched);
        setLoading(false);
      },
      (err) => {
        console.warn("Release orders fetch failed:", err.code);
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

  const handleOpenModal = (row: ReleaseOrderRow) => {
    setSelectedRow(row);
    setFormData({
      issuedBy: "S. Bautista — OIC",
      remarks: "",
      outputFormat: "PDF (for printing)",
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedRow(null);
  };

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleGeneratePdf = () => {
    console.log("Generating PDF for Order:", selectedRow?.orderId, formData);
    // TODO: Implement PDF generation logic here
    handleCloseModal();
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
              <h1>Release Orders</h1>
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
              <p className="card-eyebrow">SECTOR 3</p>
              <h2 className="card-title">Release Orders</h2>

              {loading ? (
                <div className="table-loading">
                  <p>Loading release orders...</p>
                </div>
              ) : rows.length === 0 ? (
                <div className="table-empty">
                  <p>No release orders found.</p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Order ID</th>
                        <th>CIN</th>
                        <th>Plate No.</th>
                        <th>Approved by</th>
                        <th>Date &amp; Time</th>
                        <th>Status</th>
                        <th aria-label="Actions"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id}>
                          <td className="cell-order-id">{row.orderId}</td>
                          <td>
                            <span className="cin-pill">{row.cin}</span>
                          </td>
                          <td className="cell-plate">{row.plateNo}</td>
                          <td className="cell-approved-by">{row.approvedBy}</td>
                          <td className="cell-datetime">{row.dateTime}</td>
                          <td>
                            <span className={`status-pill ${getStatusClass(row.status)}`}>
                              {row.status}
                            </span>
                          </td>
                          <td className="cell-more">
                            <button
                              type="button"
                              className="row-more-btn"
                              aria-label="More options"
                              onClick={() => handleOpenModal(row)}
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

      {/* GENERATE PDF MODAL */}
      {isModalOpen && selectedRow && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{selectedRow.orderId}</h3>
              <button className="modal-close-btn" onClick={handleCloseModal}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {/* RELEASE ORDER PREVIEW BOX */}
              <div className="order-preview">
                <p className="order-preview-title">RELEASE ORDER PREVIEW</p>
                <div className="order-preview-grid">
                  <p>
                    <strong>CIN:</strong> {selectedRow.cin}
                  </p>
                  <p>
                    <strong>Order no.:</strong> {selectedRow.orderId}
                  </p>
                  <p>
                    <strong>Plate:</strong> {selectedRow.plateNo}
                  </p>
                  <p>
                    <strong>Vehicle type:</strong> {selectedRow.vehicleType}
                  </p>
                  <p>
                    <strong>Sector:</strong> {selectedRow.sector}
                  </p>
                  <p>
                    <strong>Date:</strong> {selectedRow.dateTime.split(",")[0]}
                  </p>
                </div>
              </div>

              {/* Issued by */}
              <div className="form-group">
                <label htmlFor="issuedBy">Issued by (auto-filled)</label>
                <input
                  id="issuedBy"
                  name="issuedBy"
                  type="text"
                  className="form-input"
                  value={formData.issuedBy}
                  readOnly
                />
              </div>

              {/* Remarks */}
              <div className="form-group">
                <label htmlFor="remarks">Remarks / special instructions (optional)</label>
                <textarea
                  id="remarks"
                  name="remarks"
                  className="form-textarea"
                  value={formData.remarks}
                  onChange={handleFormChange}
                />
              </div>

              {/* Output Format */}
              <div className="form-group">
                <label htmlFor="outputFormat">Output format</label>
                <select
                  id="outputFormat"
                  name="outputFormat"
                  className="form-select"
                  value={formData.outputFormat}
                  onChange={handleFormChange}
                >
                  <option value="PDF (for printing)">PDF (for printing)</option>
                  <option value="PDF (for digital copy)">PDF (for digital copy)</option>
                </select>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={handleCloseModal}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleGeneratePdf}>
                Generate PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}