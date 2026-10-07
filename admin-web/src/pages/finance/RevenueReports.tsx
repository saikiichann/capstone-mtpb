import { useState, useEffect, useRef, useMemo } from "react";
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
  where,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./RevenueReports.css";

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

type CurrentUser = { name: string; role: RoleSlug };

type RevenuePoint = { day: string; value: number };

type Metrics = {
  todayRevenue: number;
  totalRevenue: number;
  thisMonthRevenue: number;
};

type PaymentRecord = {
  id: string;
  referenceNumber: string;
  orNumber: string | null;
  amount: number;
  verifiedAt: Timestamp | null;
};

type NavItem = { label: string; icon: string; path: string; active?: boolean };
type NavGroup = { label: string; items: NavItem[] };

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
    items: [{ label: "Overview", icon: overviewIcon, path: "/finance" }],
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
const formatCurrency = (amount: number): string =>
  `₱${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

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
  const [allPayments, setAllPayments] = useState<PaymentRecord[]>([]);

  /* Current user */
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

  /* Payments listener */
  useEffect(() => {
    const q = query(
      collection(db, "payments"),
      where("status", "==", "Verified")
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const payments: PaymentRecord[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            referenceNumber: data.referenceNumber ?? d.id,
            orNumber: data.orNumber ?? null,
            amount: Number(data.totalAmount ?? data.amount ?? 0),
            verifiedAt: (data.verifiedAt as Timestamp) ?? null,
          };
        });

        // Metrics
        const todayRevenue = payments
          .filter((p) => isToday(p.verifiedAt))
          .reduce((sum, p) => sum + p.amount, 0);

        const thisMonthRevenue = payments
          .filter((p) => isThisMonth(p.verifiedAt))
          .reduce((sum, p) => sum + p.amount, 0);

        const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);

        setMetrics({ todayRevenue, totalRevenue, thisMonthRevenue });

        // Chart — last 7 days
        const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const revenueMap: Record<string, number> = {};
        days.forEach((d) => (revenueMap[d] = 0));

        const today = new Date();
        payments.forEach((p) => {
          if (p.verifiedAt) {
            try {
              const date = p.verifiedAt.toDate();
              const diffDays = Math.floor(
                (today.getTime() - date.getTime()) / 86400000
              );
              if (diffDays >= 0 && diffDays <= 6) {
                const jsDay = date.getDay();
                const dayLabel = days[(jsDay + 6) % 7];
                if (dayLabel in revenueMap) revenueMap[dayLabel] += p.amount;
              }
            } catch {
              // skip
            }
          }
        });

        setRevenueData(
          days.map((day) => ({ day, value: revenueMap[day] }))
        );

        setAllPayments(payments);
        setLoading(false);
      },
      (err) => {
        console.warn("Revenue fetch failed:", err.code);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  /* Click outside */
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  /* OR Range summary — mula sa lahat ng payments */
  const orRange = useMemo(() => {
    const orNumbers = allPayments
      .map((p) => p.orNumber)
      .filter(Boolean) as string[];

    if (orNumbers.length === 0) {
      return { from: "—", to: "—", count: 0 };
    }

    const sorted = [...orNumbers].sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });

    return {
      from: sorted[0],
      to: sorted[sorted.length - 1],
      count: orNumbers.length,
    };
  }, [allPayments]);

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

  return (
    <div className="finance-page">
      <div className="dashboard">
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
            {/* METRIC CARDS */}
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

            {/* OR RANGE SUMMARY */}
            <div className="card">
              <p className="card-eyebrow">Official Receipts</p>
              <h2 className="card-title">OR Range Summary</h2>

              <div className="or-summary-grid">
                <div className="or-summary-item">
                  <span className="or-summary-label">OR Range</span>
                  <span className="or-summary-value">
                    {orRange.count > 0
                      ? `${orRange.from} — ${orRange.to}`
                      : "No records"}
                  </span>
                </div>
                <div className="or-summary-item">
                  <span className="or-summary-label">Receipts Issued</span>
                  <span className="or-summary-value">{orRange.count}</span>
                </div>
                <div className="or-summary-item">
                  <span className="or-summary-label">Total Verified</span>
                  <span className="or-summary-value">
                    {formatCurrency(metrics.totalRevenue)}
                  </span>
                </div>
              </div>

              <p className="or-summary-note">
                Use this range to reconcile against the physical OR booklet.
                Any gap in the sequence may indicate missing or unrecorded receipts.
              </p>
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