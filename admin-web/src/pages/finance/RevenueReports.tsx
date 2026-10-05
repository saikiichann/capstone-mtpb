import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";
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
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./RevenueReports.css";

// Asset imports
import mtpbLogo from "../../assets/mtpb-logo.png";
import officerAvatar from "../../assets/user.png";
import overviewIcon from "../../assets/overview.png";
import pendingPaymentsIcon from "../../assets/pendingpayments.png";
import paymentVerificationIcon from "../../assets/paymentverification.png";
import transactionIcon from "../../assets/transaction.png";
import revenueIcon from "../../assets/revenue.png";
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

type RevenuePoint = {
  day: string;
  value: number;
};

type Metrics = {
  todayRevenue: number;
  totalRevenue: number;
  thisMonthRevenue: number;
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
const DAILY_TARGET = 10000;

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
      { label: "Overview", icon: overviewIcon, path: "/finance" },
    ],
  },
  {
    label: "Payment/Finance",
    items: [
      { label: "Pending Payments", icon: pendingPaymentsIcon, path: "/finance/pending" },
      { label: "Payment Verification", icon: paymentVerificationIcon, path: "/finance/verification" },
      { label: "Transaction History", icon: transactionIcon, path: "/finance/transactions" },
      { label: "Revenue Reports", icon: revenueIcon, path: "/finance/revenue", active: true },
    ],
  },

  {
    label: "Reports",
    items: [
      { label: "All Reports", icon: allReportsIcon, path: "/finance/reports" },
      { label: "Export Center", icon: exportCenterIcon, path: "/finance/export" },
    ],
  },
];

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
const formatCurrency = (amount: number): string => {
  return `₱${amount.toLocaleString("en-US")}`;
};

const formatCompactCurrency = (amount: number): string => {
  if (amount >= 1000) return `₱${(amount / 1000).toFixed(0)}k`;
  return `₱${amount}`;
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

const isThisMonth = (ts: Timestamp | null): boolean => {
  if (!ts) return false;
  try {
    const date = ts.toDate();
    const now = new Date();
    return (
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear()
    );
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------
export default function RevenueReports() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "finance",
  });

  const [metrics, setMetrics] = useState<Metrics>({
    todayRevenue: 0,
    totalRevenue: 0,
    thisMonthRevenue: 0,
  });
  const [revenueData, setRevenueData] = useState<RevenuePoint[]>([]);
  const [loading, setLoading] = useState(true);

  // -----------------------------------------------------------------------
  // EFFECT: Fetch current user
  // -----------------------------------------------------------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) {
        setCurrentUser({ name: "Guest", role: "finance" });
        return;
      }
      try {
        const userDocRef = doc(db, "users", loggedUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          setCurrentUser({
            name: data.name ?? "Unknown",
            role: (data.role ?? "finance") as RoleSlug,
          });
        } else {
          setCurrentUser({
            name: loggedUser.email?.split("@")[0] ?? "Unknown",
            role: "finance",
          });
        }
      } catch (err) {
        console.error("Error fetching current user:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  // -----------------------------------------------------------------------
  // EFFECT: Real-time listener for violations (revenue source)
  // ✅ CHANGED: Reads from "violations" collection
  // -----------------------------------------------------------------------
  useEffect(() => {
    const ref = collection(db, "violations");

    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const allPayments = snap.docs.map((d) => {
          const data = d.data();
          return {
            // Use fineAmount instead of amount
            amount: Number(data.fineAmount ?? 0),
            // Use paymentStatus instead of status
            status: data.paymentStatus ?? "Unpaid",
            // Use verifiedAt (same field)
            verifiedAt: data.verifiedAt ?? null,
          };
        });

        // Only count "Verified" payments
        const verified = allPayments.filter((p) => p.status === "Verified");

        // Compute metrics
        const todayRevenue = verified
          .filter((p) => isToday(p.verifiedAt))
          .reduce((sum, p) => sum + p.amount, 0);

        const thisMonthRevenue = verified
          .filter((p) => isThisMonth(p.verifiedAt))
          .reduce((sum, p) => sum + p.amount, 0);

        const totalRevenue = verified.reduce((sum, p) => sum + p.amount, 0);

        setMetrics({ todayRevenue, totalRevenue, thisMonthRevenue });

        // Compute last 7 days revenue
        const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const revenueMap: Record<string, number> = {};
        days.forEach((d) => (revenueMap[d] = 0));

        const today = new Date();
        verified.forEach((p) => {
          if (p.verifiedAt) {
            try {
              const date = p.verifiedAt.toDate();
              const diffDays = Math.floor(
                (today.getTime() - date.getTime()) / 86400000
              );
              if (diffDays >= 0 && diffDays <= 6) {
                const jsDay = date.getDay(); // 0=Sun, 1=Mon...
                const dayLabel = days[(jsDay + 6) % 7]; // Shift so Mon=0
                if (dayLabel in revenueMap) revenueMap[dayLabel] += p.amount;
              }
            } catch {
              // skip invalid date
            }
          }
        });

        const revenueArr: RevenuePoint[] = days.map((day) => ({
          day,
          value: revenueMap[day],
        }));
        setRevenueData(revenueArr);
        setLoading(false);
      },
      (err) => {
        console.warn("Revenue fetch failed:", err.code);
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

  const metricCards = [
    {
      title: "Revenue by day",
      value: formatCurrency(metrics.todayRevenue),
      subtitle: `Target ${formatCurrency(DAILY_TARGET)}`,
    },
    {
      title: "Total Revenue",
      value: formatCurrency(metrics.totalRevenue),
      subtitle: "Sector 3, Last 7 days",
    },
    {
      title: "This Month",
      value: formatCurrency(metrics.thisMonthRevenue),
    },
  ];

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------
  return (
    <div className="finance-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <img src={mtpbLogo} alt="MTPB Logo" className="sidebar-logo-img" />
            <div>
              <p className="sidebar-brand-name">MTPB</p>
              <p className="sidebar-brand-role">Finance Staff</p>
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
              <h1>Revenue Reports</h1>
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

            {/* REVENUE CHART */}
            <div className="card">
              <p className="card-eyebrow">Sector 3 · Last 7 days</p>
              <h2 className="card-title">Revenue by day</h2>

              {loading ? (
                <div className="table-loading">
                  <p>Loading chart...</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={revenueData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#eee"
                    />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 12, fill: "#6B7280" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#9CA3AF" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(value) => formatCompactCurrency(value)}
                    />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      cursor={{ fill: "rgba(59, 130, 246, 0.08)" }}
                    />
                    <Bar
                      dataKey="value"
                      fill="#3B82F6"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={60}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}