import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./Homepage.css";

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

type MetricCard = {
  title: string;
  value: string;
  subtitle?: string;
  colorClass?: string;
};

type WeekDataPoint = {
  day: string;
  value: number;
};

type ViolationType = {
  name: string;
  value: number;
};

type ActivityItem = {
  text: string;
  bold: boolean;
  time: string;
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
   EMPTY STATE DATA
------------------------------------------------------------------ */
const EMPTY_WEEK_DATA: WeekDataPoint[] = [
  { day: "SUN", value: 0 },
  { day: "MON", value: 0 },
  { day: "TUE", value: 0 },
  { day: "WED", value: 0 },
  { day: "THU", value: 0 },
  { day: "FRI", value: 0 },
  { day: "SAT", value: 0 },
];

const EMPTY_TOP_VIOLATIONS: ViolationType[] = [
  { name: "Illegal Parking", value: 0 },
  { name: "No Parking Zone", value: 0 },
  { name: "Obstruction", value: 0 },
  { name: "Counter-flow", value: 0 },
  { name: "Expired OVR/TOP", value: 0 },
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
        active: true,
      },
      {
        label: "Sector Analytics",
        icon: sectorAnalyticsIcon,
        path: "/dashboard/sector-analytics",
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
const formatRelativeTime = (ts: Timestamp | null): string => {
  if (!ts) return "just now";
  try {
    const date = ts.toDate();
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  } catch {
    return "just now";
  }
};

const isToday = (ts: Timestamp | null): boolean => {
  if (!ts) return false;
  try {
    const date = ts.toDate();
    const now = new Date();
    return date.toDateString() === now.toDateString();
  } catch {
    return false;
  }
};

const getDayAbbr = (date: Date): string => {
  return ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][date.getDay()];
};

const formatCurrency = (amount: number): string => {
  if (amount >= 1000) return `₱${(amount / 1000).toFixed(1)}k`;
  return `₱${amount.toFixed(0)}`;
};

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
function Homepage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "oic",
  });

  const [activeClamps, setActiveClamps] = useState("0");
  const [violationsToday, setViolationsToday] = useState("0");
  const [impounded, setImpounded] = useState("0");
  const [pendingRelease, setPendingRelease] = useState("0");
  const [pendingPayments, setPendingPayments] = useState("0");
  const [revenueToday, setRevenueToday] = useState("₱0");

  const [weekData, setWeekData] = useState<WeekDataPoint[]>(EMPTY_WEEK_DATA);
  const [topViolations, setTopViolations] =
    useState<ViolationType[]>(EMPTY_TOP_VIOLATIONS);

  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);

  /* ================================================================
     1. Fetch current user
  ================================================================ */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) {
        setCurrentUser({ name: "Guest", role: "oic" });
        return;
      }
      try {
        const userDocRef = doc(db, "users", loggedUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          setCurrentUser({
            name: data.name ?? "Unknown",
            role: (data.role ?? "oic") as RoleSlug,
          });
        } else {
          setCurrentUser({
            name: loggedUser.email?.split("@")[0] ?? "Unknown",
            role: "oic",
          });
        }
      } catch (err) {
        console.error("Error fetching current user:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  /* ================================================================
     2. Active Clamps
  ================================================================ */
  useEffect(() => {
    const ref = collection(db, "clampingRecords");
    const q = query(ref, where("status", "==", "active"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => setActiveClamps(String(snap.size)),
      (err) => {
        console.warn("Clamping records fetch failed:", err.code);
        setActiveClamps("0");
      }
    );
    return () => unsubscribe();
  }, []);

  /* ================================================================
     3. Violations
  ================================================================ */
  useEffect(() => {
    const ref = collection(db, "violations");
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const todayViolations = snap.docs.filter((d) => {
          const data = d.data();
          return isToday(data.timestamp);
        });
        setViolationsToday(String(todayViolations.length));

        const daysMap: Record<string, number> = {};
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          daysMap[getDayAbbr(d)] = 0;
        }

        snap.docs.forEach((doc) => {
          const data = doc.data();
          if (data.timestamp) {
            try {
              const date = data.timestamp.toDate();
              const diffDays = Math.floor(
                (today.getTime() - date.getTime()) / 86400000
              );
              if (diffDays >= 0 && diffDays <= 6) {
                const dayKey = getDayAbbr(date);
                if (dayKey in daysMap) daysMap[dayKey]++;
              }
            } catch {
              // skip
            }
          }
        });

        const weekArr: WeekDataPoint[] = Object.entries(daysMap).map(
          ([day, value]) => ({ day, value })
        );
        setWeekData(weekArr);

        const typeMap: Record<string, number> = {};
        snap.docs.forEach((doc) => {
          const data = doc.data();
          const type = data.violationType ?? data.type ?? "Other";
          typeMap[type] = (typeMap[type] || 0) + 1;
        });

        const topArr: ViolationType[] = Object.entries(typeMap)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5);

        if (topArr.length > 0) {
          setTopViolations(topArr);
        } else {
          setTopViolations(EMPTY_TOP_VIOLATIONS);
        }
      },
      (err) => {
        console.warn("Violations fetch failed:", err.code);
        setViolationsToday("0");
        setWeekData(EMPTY_WEEK_DATA);
        setTopViolations(EMPTY_TOP_VIOLATIONS);
      }
    );
    return () => unsubscribe();
  }, []);

  /* ================================================================
     4. Impounded
  ================================================================ */
  useEffect(() => {
    const ref = collection(db, "impoundRecords");
    const q = query(ref, where("status", "==", "impounded"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => setImpounded(String(snap.size)),
      (err) => {
        console.warn("Impound records fetch failed:", err.code);
        setImpounded("0");
      }
    );
    return () => unsubscribe();
  }, []);

  /* ================================================================
     5. Pending Release
  ================================================================ */
  useEffect(() => {
    const ref = collection(db, "releaseRequests");
    const q = query(ref, where("status", "==", "pending"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => setPendingRelease(String(snap.size)),
      (err) => {
        console.warn("Release requests fetch failed:", err.code);
        setPendingRelease("0");
      }
    );
    return () => unsubscribe();
  }, []);

  /* ================================================================
     6. Payments
  ================================================================ */
  useEffect(() => {
    const ref = collection(db, "payments");
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        let pendingCount = 0;
        let revenueTodaySum = 0;

        snap.docs.forEach((doc) => {
          const data = doc.data();
          if (data.status === "pending") pendingCount++;

          if (
            data.status === "completed" &&
            isToday(data.timestamp) &&
            typeof data.amount === "number"
          ) {
            revenueTodaySum += data.amount;
          }
        });

        setPendingPayments(String(pendingCount));
        setRevenueToday(
          revenueTodaySum > 0 ? formatCurrency(revenueTodaySum) : "₱0"
        );
      },
      (err) => {
        console.warn("Payments fetch failed:", err.code);
        setPendingPayments("0");
        setRevenueToday("₱0");
      }
    );
    return () => unsubscribe();
  }, []);

  /* ================================================================
     7. Recent Activity
  ================================================================ */
  useEffect(() => {
    const ref = collection(db, "auditLogs");
    const q = query(ref, orderBy("timestamp", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const items: ActivityItem[] = snap.docs.slice(0, 4).map((doc) => {
          const data = doc.data();
          const isBold = (data.action || "").toLowerCase().includes("release");
          const text = `${data.userName ?? "System"} — ${data.action ?? "activity"}`;
          return {
            text,
            bold: isBold,
            time: formatRelativeTime(data.timestamp),
          };
        });
        setRecentActivity(items);
      },
      (err) => {
        console.warn("Recent activity fetch failed:", err.code);
        setRecentActivity([]);
      }
    );
    return () => unsubscribe();
  }, []);

  /* ================================================================
     Click-outside
  ================================================================ */
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

  /* ================================================================
     Logout
  ================================================================ */
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

  const handleChangePassword = () => {
    console.log("Navigating to Change Password...");
    setIsMenuOpen(false);
  };

  /* ================================================================
     Metric Cards
  ================================================================ */
  const metricCards: MetricCard[] = [
    {
      title: "Active Clamps",
      value: activeClamps,
      colorClass: "text-green",
    },
    {
      title: "Violations Today",
      value: violationsToday,
      colorClass: "text-green",
    },
    { title: "Impounded", value: impounded },
    { title: "Pending Release", value: pendingRelease },
    { title: "Pending Payments", value: pendingPayments },
    { title: "Revenue Today", value: revenueToday },
  ];

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
            {/* METRIC CARDS */}
            <div className="metric-grid">
              {metricCards.map((card) => (
                <div key={card.title} className="card metric-card">
                  <p className="metric-title">{card.title}</p>
                  <p className="metric-value">{card.value}</p>
                  {card.subtitle && (
                    <p
                      className={`metric-subtitle ${card.colorClass ?? ""}`}
                    >
                      {card.subtitle}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* MIDDLE ROW */}
            <div className="middle-row">
              <div className="card">
                <p className="card-eyebrow">This Week</p>
                <h2 className="card-title">
                  Violations recorded — Sector 3
                </h2>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={weekData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#eee"
                    />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: "#9CA3AF" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#9CA3AF" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#22D3EE"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="card">
                <p className="card-eyebrow">Live Feed</p>
                <h2 className="card-title">Recent Activity</h2>
                <ul className="activity-list">
                  {recentActivity.length === 0 ? (
                    <li className="activity-item">
                      <span className="activity-text">
                        No recent activity
                      </span>
                    </li>
                  ) : (
                    recentActivity.map((item, i) => (
                      <li key={i} className="activity-item">
                        <span
                          className={
                            item.bold ? "activity-bold" : "activity-text"
                          }
                        >
                          {item.bold ? (
                            <>
                              <span className="activity-bold-part">
                                {item.text.split(" — ")[0]}
                              </span>
                              {" — " + item.text.split(" — ")[1]}
                            </>
                          ) : (
                            item.text
                          )}
                        </span>
                        <span className="activity-time">{item.time}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>

            {/* BOTTOM ROW */}
            <div className="card">
              <p className="card-eyebrow">Sector 3</p>
              <h2 className="card-title">Top Violations</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={topViolations}
                  layout="vertical"
                  margin={{ left: 40 }}
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
                  <Tooltip />
                  <Bar
                    dataKey="value"
                    fill="#5B8FF9"
                    radius={[0, 4, 4, 0]}
                    barSize={22}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default Homepage;