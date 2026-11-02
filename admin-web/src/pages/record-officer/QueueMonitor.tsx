import { useState, useEffect } from "react";
import { MoreHorizontal, ChevronDown } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./QueueMonitor.css";

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
import { clientIp } from "../../lib/staffSession";

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

type QueueStatus = "Ready for release" | "Awaiting for verification" | "In queue";

type QueueRow = {
  id: string;
  queue: string;
  cin: string;
  plateNo: string;
  vehicleType: string;
  waitingMinutes: number;
  status: QueueStatus;
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
const STATUS_OPTIONS: QueueStatus[] = [
  "Ready for release",
  "Awaiting for verification",
  "In queue",
];

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Dashboard",
    items: [
      { label: "Overview", icon: overviewIcon, path: "/record-officer" },
      { label: "Queue Monitor", icon: queueMonitorIcon, path: "/record-officer/queue", active: true },
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
const getQueueStatusClass = (status: QueueStatus): string => {
  const map: Record<QueueStatus, string> = {
    "Ready for release": "status-ready",
    "Awaiting for verification": "status-awaiting",
    "In queue": "status-inqueue",
  };
  return map[status] ?? "";
};

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------
export default function QueueMonitor() {

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "record-officer",
  });

  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openStatusFor, setOpenStatusFor] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

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
  // EFFECT: Real-time listener for release queue
  // -----------------------------------------------------------------------
  useEffect(() => {
    const ref = collection(db, "releaseQueue");
    const q = query(ref, orderBy("waitingMinutes", "asc"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const fetched: QueueRow[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            queue: data.queue ?? "—",
            cin: data.cin ?? "—",
            plateNo: data.plateNo ?? "—",
            vehicleType: data.vehicleType ?? "—",
            waitingMinutes: Number(data.waitingMinutes ?? 0),
            status: (data.status ?? "In queue") as QueueStatus,
          };
        });
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

  // -----------------------------------------------------------------------
  // EFFECT: Click-outside for dropdown
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // EFFECT: Escape key for status dropdown
  // -----------------------------------------------------------------------
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenStatusFor(null);
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  // -----------------------------------------------------------------------
  // HANDLERS
  // -----------------------------------------------------------------------

  const handleStatusChange = async (row: QueueRow, newStatus: QueueStatus) => {
    if (newStatus === row.status) {
      setOpenStatusFor(null);
      return;
    }

    setSaving(row.id);
    setOpenStatusFor(null);

    try {
      const rowRef = doc(db, "releaseQueue", row.id);
      await updateDoc(rowRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.name,
      });

      await addDoc(collection(db, "auditLogs"), {
        userName: currentUser.name,
        action: `updated queue ${row.queue} (${row.status} → ${newStatus})`,
        record: row.cin,
        type: "release-queue",
        metadata: {
          queue: row.queue,
          cin: row.cin,
          oldStatus: row.status,
          newStatus,
        },
        timestamp: serverTimestamp(),
        ipAddress: clientIp(),
      });

    } catch (err) {
      console.error("Error updating status:", err);
      alert((err as Error)?.message || "Failed to update status.");
    } finally {
      setSaving(null);
    }
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
              <h1>Queue Monitor</h1>
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
              <p className="card-eyebrow">Release Management · FIFO</p>
              <h2 className="card-title">Sector 3 Release Queue</h2>

              {loading ? (
                <div className="table-loading">
                  <p>Loading queue...</p>
                </div>
              ) : rows.length === 0 ? (
                <div className="table-empty">
                  <p>No vehicles in queue.</p>
                </div>
              ) : (
                <div className="table-wrapper" tabIndex={0} role="region" aria-label="Data table" data-scroll-region>
                  <table className="data-table queue-table">
                    <thead>
                      <tr>
                        <th>Queue</th>
                        <th>CIN</th>
                        <th>Plate No.</th>
                        <th>Vehicle Type</th>
                        <th>Waiting</th>
                        <th>Status</th>
                        <th aria-label="Actions"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id}>
                          <td className="cell-queue">{row.queue}</td>
                          <td>
                            <span className="cin-pill">{row.cin}</span>
                          </td>
                          <td className="cell-plate">{row.plateNo}</td>
                          <td className="cell-vehicle">{row.vehicleType}</td>
                          <td className="cell-waiting">{row.waitingMinutes} min</td>
                          <td className="cell-status">
                            <div className="status-dropdown-wrapper">
                              <button
                                type="button"
                                className={`status-pill ${getQueueStatusClass(row.status)} status-pill-button`}
                                onClick={() =>
                                  setOpenStatusFor(
                                    openStatusFor === row.id ? null : row.id
                                  )
                                }
                                disabled={saving === row.id}
                              >
                                <span>{saving === row.id ? "Saving..." : row.status}</span>
                                <ChevronDown size={14} />
                              </button>

                              {openStatusFor === row.id && (
                                <div className="status-dropdown-menu">
                                  {STATUS_OPTIONS.map((s) => (
                                    <button
                                      key={s}
                                      type="button"
                                      className={`status-dropdown-item ${s === row.status ? "active" : ""}`}
                                      onClick={() => handleStatusChange(row, s)}
                                    >
                                      {s}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
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
    </div>
  );
}