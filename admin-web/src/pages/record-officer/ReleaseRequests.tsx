import { useState, useEffect } from "react";
import { MoreHorizontal, X } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./ReleaseRequests.css";

// Asset imports
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
import AppTopbar from "../../components/AppTopbar";
import AppSidebar from "../../components/AppSidebar";

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

type ReleaseStatus = "Ready for Release" | "Awaiting Verification";

type ReleaseRow = {
  id: string;
  cin: string;
  plateNo: string;
  vehicleType: string;
  queueNo: string;
  status: ReleaseStatus;
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
      { label: "Release Requests", icon: releaseRequestsIcon, path: "/record-officer/release-requests", active: true },
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
const getStatusClass = (status: ReleaseStatus): string => {
  const map: Record<ReleaseStatus, string> = {
    "Ready for Release": "status-ready-pill",
    "Awaiting Verification": "status-awaiting-pill",
  };
  return map[status] ?? "";
};

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------
export default function ReleaseRequests() {

  const [, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "record-officer",
  });

  const [rows, setRows] = useState<ReleaseRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ReleaseRow | null>(null);

  // Form State for Modal
  const [formData, setFormData] = useState({
    plateNo: "",
    cin: "",
    status: "Ready for Release" as ReleaseStatus,
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
  // EFFECT: Real-time listener for release requests
  // -----------------------------------------------------------------------
  useEffect(() => {
    const ref = collection(db, "releaseRequests");
    const q = query(ref, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const fetched: ReleaseRow[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            cin: data.cin ?? "—",
            plateNo: data.plateNo ?? "—",
            vehicleType: data.vehicleType ?? "—",
            queueNo: data.queueNo ?? "—",
            status: (data.status ?? "Awaiting Verification") as ReleaseStatus,
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

  // -----------------------------------------------------------------------
  // EFFECT: Click-outside for dropdown
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // HANDLERS
  // -----------------------------------------------------------------------

  const handleOpenEditModal = (row: ReleaseRow) => {
    setSelectedRow(row);
    setFormData({
      plateNo: row.plateNo,
      cin: row.cin,
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
    handleCloseEditModal();
  };

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------
  return (
    <div className="record-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <AppSidebar groups={NAV_GROUPS} role={<>Record Officer</>} />

        {/* MAIN CONTENT */}
        <div className="main">
          <AppTopbar groups={NAV_GROUPS} />
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

          </header>

          <main className="main-content">
            <div className="card">
              <div className="card-header-row">
                <div>
                  <p className="card-eyebrow">AWAITING ACTION</p>
                  <h2 className="card-title">Release Requests</h2>
                </div>
                <p className="card-summary">
                    <strong>Pending Requests: </strong> {rows.length} total
                </p>
              </div>

              {loading ? (
                <div className="table-loading">
                  <p>Loading release requests...</p>
                </div>
              ) : rows.length === 0 ? (
                <div className="table-empty">
                  <p>No release requests found.</p>
                </div>
              ) : (
                <div className="table-wrapper" tabIndex={0} role="region" aria-label="Data table" data-scroll-region>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>CIN</th>
                        <th>Plate No.</th>
                        <th>Vehicle Type</th>
                        <th>Queue No.</th>
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
                          <td className="cell-queue-no">{row.queueNo}</td>
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
              <h3 className="modal-title">{selectedRow.queueNo}</h3>
              <button aria-label="Close" className="modal-close-btn" onClick={handleCloseEditModal}>
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
                  readOnly
                />
              </div>

              <div className="form-group">
                <label htmlFor="cin">CIN</label>
                <input
                  id="cin"
                  name="cin"
                  type="text"
                  className="form-input"
                  value={formData.cin}
                  onChange={handleFormChange}
                  readOnly
                />
              </div>

              <div className="form-group form-group-full">
                <label htmlFor="status">Status</label>
                <select
                  id="status"
                  name="status"
                  className="form-select"
                  value={formData.status}
                  onChange={handleFormChange}
                >
                  <option value="Ready for Release">Ready for Release</option>
                  <option value="Awaiting Verification">Awaiting Verification</option>
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