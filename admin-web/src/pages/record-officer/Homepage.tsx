import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  type DocumentData
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./Homepage.css";

// Asset imports
import overviewIcon from "../../assets/overview.png";
import allViolationsIcon from "../../assets/allviolations.png";
import clampingIcon from "../../assets/clamping.png";
import impoundingIcon from "../../assets/impounding.png";
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

// Matches pages/record-officer/AllViolations.tsx exactly — status is
// derived from paymentStatus + releaseStatus, not a stored `status`
// field. The old 4-state Pending Settlement/Settled/For Release/Disputed
// vocabulary and its editable-status modal are gone: there's no
// standalone status field for a Record Officer to hand-set anymore: the
// real system moves a violation through this flow via Payment
// Verification (Finance), approval (OIC), and release (Release Officer),
// each writing paymentStatus/releaseStatus — not via a dropdown here.
type ViolationStatus =
  | "Unpaid"
  | "Pending Verification"
  | "Awaiting OIC Approval"
  | "Approved — For Release"
  | "Released"
  | "Payment Rejected";

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
  unpaid: number;
  paymentRejected: number;
  released: number;
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
// Trimmed to match the Figma design — Queue Monitor, Vehicle History,
// Release Requests, and Release Orders removed, same as
// pages/record-officer/ClampingLog.tsx. All Violations is kept.
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Dashboard",
    items: [
      {
        label: "Overview",
        icon: overviewIcon,
        path: "/record-officer",
        active: true,
      },
    ],
  },
  {
    label: "Enforcement",
    items: [
      {
        label: "All Violations",
        icon: allViolationsIcon,
        path: "/record-officer/violations",
      },
      { label: "Clamping Log", icon: clampingIcon, path: "/record-officer/clamping" },
      {
        label: "Impounding Log",
        icon: impoundingIcon,
        path: "/record-officer/impounding",
      },
    ],
  },
  {
    label: "Vehicle Release",
    items: [
      {
        label: "Release Log",
        icon: releaseLogIcon,
        path: "/record-officer/release-log",
      },
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
  unpaid: 0,
  paymentRejected: 0,
  released: 0,
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
    Unpaid: "status-unpaid",
    "Pending Verification": "status-pending-verification",
    "Awaiting OIC Approval": "status-awaiting-oic",
    "Approved — For Release": "status-approved",
    Released: "status-released",
    "Payment Rejected": "status-rejected",
  };
  return map[status] ?? "";
};

/**
 * Derive the violation status from payment + release fields — copied
 * verbatim from pages/record-officer/AllViolations.tsx so the two pages
 * can't drift out of sync. See that file for the detection-order
 * comment.
 */
const deriveStatus = (data: DocumentData): ViolationStatus => {
  const paymentStatus = String(data.paymentStatus ?? "").toLowerCase();
  const releaseStatus = String(data.releaseStatus ?? "").toLowerCase();

  if (paymentStatus === "rejected") {
    return "Payment Rejected";
  }

  if (data.rejectionReason && data.rejectedAt) {
    return "Payment Rejected";
  }

  if (releaseStatus === "released") {
    return "Released";
  }

  if (releaseStatus === "approved by oic") {
    return "Approved — For Release";
  }

  if (releaseStatus === "awaiting oic approval") {
    return "Awaiting OIC Approval";
  }

  if (paymentStatus === "pending verification") {
    return "Pending Verification";
  }

  return "Unpaid";
};

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------
export default function RecordOfficerHomepage() {
  const navigate = useNavigate();

  const [, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "record-officer",
  });

  const [metrics, setMetrics] = useState<Metrics>(INITIAL_METRICS);
  const [recentRows, setRecentRows] = useState<ViolationRow[]>([]);
  const [topViolations, setTopViolations] = useState<ViolationStat[]>([]);
  const [loading, setLoading] = useState(true);

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
            status: deriveStatus(data),
            recordedAt: data.recordedAt ?? null,
          };
        });

        // Recent 5 for table
        setRecentRows(allRows.slice(0, 5));

        // Compute metrics — four of the six states: Total, Unpaid (needs
        // payment), Payment Rejected (needs attention), Released (done).
        // Pending Verification / Awaiting OIC Approval / Approved — For
        // Release aren't on their own card here; use All Violations'
        // filter for those.
        const totalRecords = allRows.length;
        const unpaid = allRows.filter((r) => r.status === "Unpaid").length;
        const paymentRejected = allRows.filter(
          (r) => r.status === "Payment Rejected"
        ).length;
        const released = allRows.filter((r) => r.status === "Released").length;

        setMetrics({ totalRecords, unpaid, paymentRejected, released });

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

  // -----------------------------------------------------------------------
  // HANDLERS
  // -----------------------------------------------------------------------

  const metricCards = [
    {
      title: "Total Records",
      value: String(metrics.totalRecords),
      subtitle: "Sector 3, on file",
    },
    {
      title: "Unpaid",
      value: String(metrics.unpaid),
      subtitle: "Awaiting owner payment",
    },
    {
      title: "Payment Rejected",
      value: String(metrics.paymentRejected),
      subtitle: "Needs owner follow-up",
    },
    {
      title: "Released",
      value: String(metrics.released),
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
        <AppSidebar groups={NAV_GROUPS} role={<>Record Officer</>} />

        {/* MAIN CONTENT */}
        <div className="main">
          <AppTopbar groups={NAV_GROUPS} />
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
                    margin={{ left: 8, right: 40 }}
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
                      width={170}
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
                <button
                  type="button"
                  className="card-link"
                  onClick={() => navigate("/record-officer/violations")}
                >
                  View All
                </button>
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
                <div className="table-wrapper" tabIndex={0} role="region" aria-label="Data table" data-scroll-region>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>CIN</th>
                        <th>Plate No.</th>
                        <th>Violation</th>
                        <th>Location</th>
                        <th>Status</th>
                        <th>Recorded</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentRows.map((row) => (
                        <tr key={row.id}>
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
