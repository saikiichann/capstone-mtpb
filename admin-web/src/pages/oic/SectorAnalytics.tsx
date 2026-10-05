import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./SectorAnalytics.css";

// Asset imports
import mtpbLogo from "../../assets/mtpb-logo.png";
import officerAvatar from "../../assets/user.png";
import overviewIcon from "../../assets/overview.png";
import sectorAnalyticsIcon from "../../assets/sectoranalytics.png";
import mapIcon from "../../assets/map.png";
import queueIcon from "../../assets/queue.png";
import clampingIcon from "../../assets/clamping.png";
import impoundingIcon from "../../assets/impounding.png";
import historyIcon from "../../assets/history.png";
import pendingPaymentsIcon from "../../assets/pendingpayments.png";
import paymentVerificationIcon from "../../assets/paymentverification.png";
import transactionIcon from "../../assets/transaction.png";
import revenueIcon from "../../assets/revenue.png";
import releaseRequestIcon from "../../assets/releaserequest.png";
import releaseLogIcon from "../../assets/releaselog.png";
import clampingTeamsIcon from "../../assets/clampingteams.png";
import towTruckIcon from "../../assets/tow-truck.png";
import fieldUpdateIcon from "../../assets/fieldupdate.png";
import operationSchedulerIcon from "../../assets/scheduler.png";
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

type ViolationEntry = {
  name: string;
  value: number;
  color: string;
};

type BarangayRow = {
  barangay: string;
  violations: number;
  avgFine: string;
};

type OfficerRow = {
  officer: string;
  clamps: number;
  impounds: number;
  avgResolution: string;
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
   ROLE LABELS
------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------
   SECTOR COLORS
------------------------------------------------------------------ */
const SECTOR_COLORS = [
  "#0d1b3d",
  "#1e3a8a",
  "#2547d0",
  "#3b6bf5",
  "#93c5fd",
  "#22b8e0",
  "#22d3ee",
  "#0f2a52",
];

/* ------------------------------------------------------------------
   NAV — matches target design (screenshot)
------------------------------------------------------------------ */
const navGroups: NavGroup[] = [
  {
    label: "Dashboard",
    items: [
      {
        label: "Overview",
        icon: overviewIcon,
        path: "/dashboard",
      },
      {
        label: "Sector Analytics",
        icon: sectorAnalyticsIcon,
        path: "/dashboard/sector-analytics",
        active: true,
      },
      {
        label: "Geospatial Heatmap",
        icon: mapIcon,
        path: "/dashboard/heatmap",
      },
    ],
  },
  {
    label: "Enforcement",
    items: [
      {
        label: "Clamping Log",
        icon: clampingIcon,
        path: "/dashboard/clamping",
      },
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
      {
        label: "Revenue Reports",
        icon: revenueIcon,
        path: "/dashboard/revenue",
      },
    ],
  },
  {
    label: "Vehicle Release",
    items: [
      {
        label: "Release Requests",
        icon: releaseRequestIcon,
        path: "/dashboard/release-requests",
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
const formatCurrency = (amount: number): string => {
  if (amount >= 1000) return `₱${(amount / 1000).toFixed(1)}k`;
  return `₱${amount.toFixed(0)}`;
};

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function SectorAnalytics() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "oic",
  });

  const [violationData, setViolationData] = useState<ViolationEntry[]>([]);
  const [barangayCoverage, setBarangayCoverage] = useState<BarangayRow[]>([]);
  const [officerPerformance, setOfficerPerformance] = useState<OfficerRow[]>([]);
  const [loading, setLoading] = useState(true);

  /* Fetch current user */
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
        console.error("Error fetching current user:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  /* Fetch violations */
  useEffect(() => {
    const ref = collection(db, "violations");

    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const allViolations = snap.docs.map((d) => d.data());

        // 1. Violations by classification (type)
        const typeMap: Record<string, number> = {};
        allViolations.forEach((v) => {
          const type = v.violationType ?? v.type ?? "Other";
          typeMap[type] = (typeMap[type] || 0) + 1;
        });

        const typeArr: ViolationEntry[] = Object.entries(typeMap)
          .map(([name, value], i) => ({
            name,
            value,
            color: SECTOR_COLORS[i % SECTOR_COLORS.length],
          }))
          .sort((a, b) => b.value - a.value);

        setViolationData(typeArr);

        // 2. Barangay coverage
        const barangayMap: Record<string, { count: number; totalFine: number }> =
          {};
        allViolations.forEach((v) => {
          const barangay =
            v.barangay ?? v.sector ?? v.location ?? "Unknown";
          if (!barangayMap[barangay]) {
            barangayMap[barangay] = { count: 0, totalFine: 0 };
          }
          barangayMap[barangay].count++;
          barangayMap[barangay].totalFine += Number(v.fineAmount ?? 0);
        });

        const barangayArr: BarangayRow[] = Object.entries(barangayMap)
          .map(([barangay, { count, totalFine }]) => ({
            barangay,
            violations: count,
            avgFine: formatCurrency(count > 0 ? totalFine / count : 0),
          }))
          .sort((a, b) => b.violations - a.violations)
          .slice(0, 4);

        setBarangayCoverage(barangayArr);

        // 3. Officer performance
        const officerMap: Record<string, { clamps: number; impounds: number }> =
          {};
        allViolations.forEach((v) => {
          const officer = v.officer ?? "Unknown";
          if (!officerMap[officer]) {
            officerMap[officer] = { clamps: 0, impounds: 0 };
          }
          const enforcementType = v.enforcementType ?? "clamped";
          if (enforcementType === "impounded") {
            officerMap[officer].impounds++;
          } else {
            officerMap[officer].clamps++;
          }
        });

        const officerArr: OfficerRow[] = Object.entries(officerMap)
          .map(([officer, { clamps, impounds }]) => ({
            officer,
            clamps,
            impounds,
            avgResolution: "16 min",
          }))
          .sort(
            (a, b) => b.clamps + b.impounds - (a.clamps + a.impounds)
          )
          .slice(0, 5);

        setOfficerPerformance(officerArr);
        setLoading(false);
      },
      (err) => {
        console.warn("Violations fetch failed:", err.code);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  /* Click-outside */
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
      console.error("Logout error:", err);
      setIsMenuOpen(false);
      navigate("/", { replace: true });
    }
  };

  const totalViolations = violationData.reduce(
    (sum, v) => sum + v.value,
    0
  );

  /* Pie tooltip */
  const PieTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const { name, value, color } = payload[0].payload;
    const pct =
      totalViolations > 0
        ? ((value / totalViolations) * 100).toFixed(1)
        : "0.0";

    return (
      <div className="pie-tooltip">
        <div className="pie-tooltip-name">
          <span
            className="pie-tooltip-swatch"
            style={{ backgroundColor: color }}
          />
          {name}
        </div>
        <div className="pie-tooltip-meta">
          {value} cases · {pct}%
        </div>
      </div>
    );
  };

  return (
    <div className="oic-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <img src={mtpbLogo} alt="MTPB Logo" className="sidebar-logo-img" />
            <div>
              <p className="sidebar-brand-name">MTPB</p>
              <p className="sidebar-brand-role">Officer in Charge</p>
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

        {/* MAIN */}
        <div className="main">
          <header className="main-header">
            <div>
              <h1>Sector Analytics</h1>
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
                  <button className="dropdown-item">
                    <KeyRound size={18} />
                    <span>Change Password</span>
                  </button>
                  <button
                    className="dropdown-item logout"
                    onClick={handleLogout}
                  >
                    <img
                      src={logoutIcon}
                      alt=""
                      className="dropdown-icon"
                    />
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </div>
          </header>

          <main className="main-content">
            {/* SPLIT: PIE + BARANGAY */}
            <div className="sector-split">
              <div className="card">
                <p className="page-eyebrow">SECTOR 3 · LAST 7 DAYS</p>
                <h2 className="page-title">
                  Violations by classification
                </h2>

                {loading ? (
                  <div className="table-loading">
                    <p>Loading chart...</p>
                  </div>
                ) : violationData.length === 0 ? (
                  <div className="table-empty">
                    <p>No violation data yet.</p>
                  </div>
                ) : (
                  <div className="sector-pie-wrap">
                    <div className="sector-pie">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={violationData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius="62%"
                            outerRadius="95%"
                            paddingAngle={1}
                            stroke="none"
                          >
                            {violationData.map((entry, i) => (
                              <Cell
                                key={i}
                                fill={entry.color}
                                className="pie-cell"
                              />
                            ))}
                          </Pie>
                          <Tooltip content={<PieTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="sector-legend">
                      {violationData.map((v) => (
                        <div key={v.name} className="sector-legend-item">
                          <span
                            className="sector-legend-swatch"
                            style={{ backgroundColor: v.color }}
                          />
                          {v.name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="card">
                <p className="page-eyebrow">SECTOR 3</p>
                <h2 className="page-title">Barangay Coverage</h2>

                {loading ? (
                  <div className="table-loading">
                    <p>Loading...</p>
                  </div>
                ) : barangayCoverage.length === 0 ? (
                  <div className="table-empty">
                    <p>No data yet.</p>
                  </div>
                ) : (
                  <table className="data-table" style={{ marginTop: 12 }}>
                    <thead>
                      <tr>
                        <th>Barangay</th>
                        <th>Violations</th>
                        <th>Avg. fine</th>
                      </tr>
                    </thead>
                    <tbody>
                      {barangayCoverage.map((row) => (
                        <tr key={row.barangay}>
                          <td style={{ color: "#0F172A" }}>
                            {row.barangay}
                          </td>
                          <td>{row.violations}</td>
                          <td>{row.avgFine}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* OFFICER PERFORMANCE */}
            <div className="card">
              <p className="page-eyebrow">OFFICER PERFORMANCE</p>
              <h2 className="page-title">
                Enforcement activity — Sector 3 officers
              </h2>

              {loading ? (
                <div className="table-loading">
                  <p>Loading...</p>
                </div>
              ) : officerPerformance.length === 0 ? (
                <div className="table-empty">
                  <p>No officer data yet.</p>
                </div>
              ) : (
                <table className="data-table" style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th>Officer</th>
                      <th>Clamps Logged</th>
                      <th>Impounds</th>
                      <th>Avg. Resolution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {officerPerformance.map((row) => (
                      <tr key={row.officer}>
                        <td style={{ color: "#0F172A" }}>{row.officer}</td>
                        <td>{row.clamps}</td>
                        <td>{row.impounds}</td>
                        <td>{row.avgResolution}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}