import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { auth, db } from "../../firebase";
import "./RevenueReports.css";

import logo from "../../assets/mtpb-logo.png";
import avatarImg from "../../assets/user.png";
import logoutIcon from "../../assets/logout.png";

import overviewIcon from "../../assets/overview.png";
import sectorAnalyticsIcon from "../../assets/sectoranalytics.png";
import mapIcon from "../../assets/map.png";
import clampingIcon from "../../assets/clamping.png";
import impoundingIcon from "../../assets/impounding.png";
import historyIcon from "../../assets/history.png";
import pendingPaymentsIcon from "../../assets/pendingpayments.png";
import paymentVerificationIcon from "../../assets/paymentverification.png";
import transactionIcon from "../../assets/transaction.png";
import revenueIcon from "../../assets/revenue.png";
import releaseRequestIcon from "../../assets/releaserequest.png";
import queueIcon from "../../assets/queue.png";
import releaseLogIcon from "../../assets/releaselog.png";
import clampingTeamsIcon from "../../assets/clampingteams.png";
import towTruckIcon from "../../assets/tow-truck.png";
import fieldUpdateIcon from "../../assets/fieldupdate.png";
import operationSchedulerIcon from "../../assets/scheduler.png";

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

type CurrentUser = { name: string; role: RoleSlug };

type DayBucket = { label: string; dateKey: string; value: number };

type PaymentSummary = {
  id: string;
  orNumber: string | null;
  amount: number;
};

type NavItem = { label: string; icon: string; path: string; active?: boolean };
type NavGroup = { label: string; items: NavItem[] };

/* ------------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------------ */
const DAILY_REVENUE_TARGET = 10000;

const ROLE_LABELS: Record<RoleSlug, string> = {
  oic: "Officer in Charge",
  "it-admin": "IT Admin",
  supervisor: "Supervisor",
  "record-officer": "Record Officer",
  "release-officer": "Release Officer",
  finance: "Finance Staff",
  "clamping-staff": "Clamping Staff",
  "impounding-staff": "Impounding Staff",
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Dashboard",
    items: [
      { label: "Overview", icon: overviewIcon, path: "/dashboard" },
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
      { label: "Clamping Log", icon: clampingIcon, path: "/dashboard/clamping" },
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
        active: true,
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
const formatCurrency = (amount: number): string =>
  `₱${Math.round(amount).toLocaleString("en-US")}`;

const dateKeyOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

const monthKeyOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const buildLast7Days = (): DayBucket[] => {
  const days: DayBucket[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push({
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      dateKey: dateKeyOf(d),
      value: 0,
    });
  }
  return days;
};

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function RevenueReports() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "oic",
  });

  const [dayBuckets, setDayBuckets] = useState<DayBucket[]>(buildLast7Days());
  const [monthTotal, setMonthTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<PaymentSummary[]>([]);

  /* Current user */
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

  /* Payments listener */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "payments"),
      (snap) => {
        const buckets = buildLast7Days();
        const bucketIndex = new Map(buckets.map((b, i) => [b.dateKey, i]));
        const thisMonthKey = monthKeyOf(new Date());
        let monthSum = 0;
        const summaries: PaymentSummary[] = [];

        snap.docs.forEach((d) => {
          const data = d.data();

          const rawStatus = String(
            data.verificationStatus ?? data.status ?? ""
          ).toLowerCase();
          const isVerified = ["verified", "succeeded", "approved"].includes(
            rawStatus
          );
          if (!isVerified) return;

          const ts = data.verifiedAt ?? data.paidAt ?? data.createdAt ?? null;
          if (!ts) return;

          let date: Date;
          try {
            date = ts.toDate();
          } catch {
            return;
          }

          const amount = Number(data.totalAmount ?? data.amount ?? 0);

          if (monthKeyOf(date) === thisMonthKey) {
            monthSum += amount;
          }

          const idx = bucketIndex.get(dateKeyOf(date));
          if (idx !== undefined) {
            buckets[idx].value += amount;
          }

          summaries.push({
            id: d.id,
            orNumber: data.orNumber ?? null,
            amount,
          });
        });

        setDayBuckets(buckets);
        setMonthTotal(monthSum);
        setPayments(summaries);
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
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
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
      navigate("/", { replace: true });
    } catch (err) {
      console.error("Logout error:", err);
      setIsMenuOpen(false);
      navigate("/", { replace: true });
    }
  };

  const navGroups = useMemo(
    () =>
      NAV_GROUPS.filter(
        (group) =>
          !(currentUser.role === "supervisor" && group.label === "Payment/Finance")
      ),
    [currentUser.role]
  );

  const todayRevenue = dayBuckets[dayBuckets.length - 1]?.value ?? 0;
  const last7DaysTotal = useMemo(
    () => dayBuckets.reduce((sum, b) => sum + b.value, 0),
    [dayBuckets]
  );

  /* OR Range summary */
  const orRange = useMemo(() => {
    const orNumbers = payments
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
  }, [payments]);

  const metricCards = [
    {
      title: "Revenue by day",
      value: formatCurrency(todayRevenue),
      subtitle: `Target ${formatCurrency(DAILY_REVENUE_TARGET)}`,
    },
    {
      title: "Total Revenue",
      value: formatCurrency(last7DaysTotal),
      subtitle: "Sector 3, Last 7 days",
    },
    {
      title: "This Month",
      value: formatCurrency(monthTotal),
      subtitle: "",
    },
  ];

  return (
    <div className="oic-page revenue-reports-page">
      <div className="dashboard">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <img src={logo} alt="MTPB logo" className="sidebar-logo-img" />
            <div>
              <p className="sidebar-brand-name">MTPB</p>
              <p className="sidebar-brand-role">
                {ROLE_LABELS[currentUser.role]}
              </p>
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
                        <span>{item.label}</span>
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
                src={avatarImg}
                alt="Account menu"
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
                    <img src={logoutIcon} alt="" className="dropdown-icon" />
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </div>
          </header>

          <main className="main-content">
            {/* METRIC CARDS */}
            <div className="pending-metrics">
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
                    {formatCurrency(last7DaysTotal)}
                  </span>
                </div>
              </div>

              <p className="or-summary-note">
                Use this range to reconcile against the physical OR booklet.
                Any gap in the sequence may indicate missing or unrecorded
                receipts.
              </p>
            </div>

            {/* CHART */}
            <div className="card">
              <p className="card-eyebrow">Sector 3 · Last 7 days</p>
              <h2 className="card-title">Revenue by day</h2>

              {loading ? (
                <div className="chart-loading">
                  <p>Loading revenue...</p>
                </div>
              ) : (
                <div className="chart-container-lg">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={dayBuckets}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid vertical={false} stroke="#eef0f3" />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 12, fill: "#94a3b8" }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        tickFormatter={(v) => `₱${Number(v) / 1000}k`}
                        width={40}
                      />
                      <Tooltip
                        contentStyle={{
                          fontSize: 12,
                          borderRadius: 8,
                          border: "1px solid #e2e8f0",
                        }}
                        formatter={(v) => [
                          `₱${Number(v).toLocaleString()}`,
                          "Revenue",
                        ]}
                      />
                      <Bar
                        dataKey="value"
                        fill="#3b82f6"
                        radius={[4, 4, 0, 0]}
                        barSize={36}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}