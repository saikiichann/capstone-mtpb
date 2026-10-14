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
import { signOut as firebaseSignOut } from "firebase/auth";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import { useStaffProfile } from "../../lib/useStaffProfile";
import {
  derivePaymentLocation,
  isInStaffScope,
  type PaymentLocation,
} from "../../lib/paymentLocation";
import "./Homepage.css";

// ---------------------------------------------------------------------------
// ASSET IMPORTS
// ---------------------------------------------------------------------------
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

// ⚠️ WALANG "Both" — dalawa lang
type AssignedLocation = "City Hall" | "Central";

type CurrentUser = {
  name: string;
  role: RoleSlug;
  assignedLocation: AssignedLocation | null;  // "City Hall" | "Central" — para sa filter
  assignedLocationName: string | null;        // buong pangalan — para sa display
};

type PaymentPriority = "High" | "Medium" | "Normal";
type PaymentMethod = "GCash" | "Cash";
type PaymentStatus = "Unpaid" | "Pending Verification" | "Verified" | "Rejected";

type PaymentRow = {
  id: string;
  reference: string;
  cin: string;
  plateNo: string;
  amount: number;
  method: PaymentMethod;
  priority: PaymentPriority;
  status: PaymentStatus;
  paymentLocation: PaymentLocation;
  recordedAt: Timestamp | null;
  verifiedAt: Timestamp | null;
};

type Metrics = {
  pendingSettlement: number;
  unpaidCount: number;
  awaitingVerification: number;
  verified: number;
  overdue: number;
};

type RevenuePoint = {
  day: string;
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
      { label: "Overview", icon: overviewIcon, path: "/finance", active: true },
    ],
  },
  {
    label: "Payment/Finance",
    items: [
      { label: "Pending Payments", icon: pendingPaymentsIcon, path: "/finance/pending" },
      { label: "Payment Verification", icon: paymentVerificationIcon, path: "/finance/verification" },
      { label: "Transaction History", icon: transactionIcon, path: "/finance/transactions" },
      { label: "Revenue Reports", icon: revenueIcon, path: "/finance/revenue" },
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

const PAYMENT_DUE_HOURS = 24;

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

const getPriorityClass = (priority: PaymentPriority): string => {
  const map: Record<PaymentPriority, string> = {
    "High": "priority-high",
    "Medium": "priority-medium",
    "Normal": "priority-normal",
  };
  return map[priority] ?? "";
};

/** Lumampas na ba sa 24-hour grace period mula recordedAt? */
const isOverdue = (recordedAt: Timestamp | null): boolean => {
  if (!recordedAt) return false;
  try {
    return Date.now() - recordedAt.toMillis() > PAYMENT_DUE_HOURS * 3600 * 1000;
  } catch {
    return false;
  }
};

/** GCash → "Online"; cash → City Hall / Central (tingnan ang lib/paymentLocation).
 *  Violations doc: paymentMethod + paymentLocation (HINDI ang `location` —
 *  street iyon kung saan na-clamp). */
const deriveLocation = (data: any): PaymentLocation =>
  derivePaymentLocation(data.paymentMethod, data.paymentLocation);

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------
export default function FinanceHomepage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  /* Profile ng naka-login na staff — naka-cache sa lahat ng Finance pages,
     kaya hindi na nagfi-flash ang data ng ibang location paglipat ng tab. */
  const { profile, ready: userReady } = useStaffProfile();
  const currentUser: CurrentUser = useMemo(
    () => ({
      name: profile?.name ?? "Loading...",
      role: ((profile?.role || "finance") as RoleSlug),
      assignedLocation: profile?.assignedLocation ?? null,
      assignedLocationName: profile?.assignedLocationName ?? null,
    }),
    [profile]
  );

  const [allRows, setAllRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  // -----------------------------------------------------------------------
  // EFFECT: Fetch violations — raw lang; ang location filter at metrics
  // ay nasa useMemo sa ibaba (hindi na nagre-resubscribe paglipat ng tab)
  // -----------------------------------------------------------------------
  useEffect(() => {
    const q = query(collection(db, "violations"), orderBy("recordedAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setAllRows(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              reference: data.paymentReference ?? data.cin ?? "—",
              cin: data.cin ?? "—",
              plateNo: data.plateNo ?? "—",
              amount: Number(data.fineAmount ?? 0),
              method: (data.paymentMethod ?? "Cash") as PaymentMethod,
              priority: "Normal" as PaymentPriority,
              status: (data.paymentStatus ?? "Unpaid") as PaymentStatus,
              paymentLocation: deriveLocation(data),
              recordedAt: (data.recordedAt as Timestamp) ?? null,
              verifiedAt: (data.verifiedAt as Timestamp) ?? null,
            };
          })
        );
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
  // DERIVED: location filter + metrics + table + chart
  //
  // Unpaid — wala pang location (hindi pa nagbabayad), kaya hindi
  //   fini-filter. Pareho ng Pending Payments page.
  // Pending Verification / Verified — may location na, kaya sariling
  //   location lang ng Finance staff ang makikita.
  // -----------------------------------------------------------------------
  const { metrics, pendingPayments, revenueData } = useMemo(() => {
    const empty = {
      metrics: {
        pendingSettlement: 0,
        unpaidCount: 0,
        awaitingVerification: 0,
        verified: 0,
        overdue: 0,
      } as Metrics,
      pendingPayments: [] as PaymentRow[],
      revenueData: [] as RevenuePoint[],
    };
    if (!userReady) return empty;

    // Finance: sariling sakop lang (City Hall; o Central + GCash)
    const filterByLocation = currentUser.role === "finance";
    const inMyLocation = (p: PaymentRow) =>
      !filterByLocation || isInStaffScope(currentUser.assignedLocation, p.paymentLocation);

    const unpaid = allRows.filter((p) => p.status === "Unpaid");
    const located = allRows.filter((p) => p.status !== "Unpaid" && inMyLocation(p));

    const m: Metrics = {
      pendingSettlement: unpaid.reduce((sum, p) => sum + p.amount, 0),
      unpaidCount: unpaid.length,
      awaitingVerification: located.filter((p) => p.status === "Pending Verification").length,
      verified: located.filter((p) => p.status === "Verified").length,
      overdue: unpaid.filter((p) => isOverdue(p.recordedAt)).length,
    };

    const pending = located
      .filter((p) => p.status === "Pending Verification")
      .slice(0, 10);

    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const revenueMap: Record<string, number> = {};
    days.forEach((d) => (revenueMap[d] = 0));
    const today = new Date();
    located.forEach((p) => {
      if (p.status !== "Verified" || !p.verifiedAt) return;
      try {
        const date = p.verifiedAt.toDate();
        const diffDays = Math.floor((today.getTime() - date.getTime()) / 86400000);
        if (diffDays >= 0 && diffDays <= 6) {
          revenueMap[days[(date.getDay() + 6) % 7]] += p.amount;
        }
      } catch {
        // skip
      }
    });

    return {
      metrics: m,
      pendingPayments: pending,
      revenueData: days.map((day) => ({ day, value: revenueMap[day] })),
    };
  }, [allRows, userReady, currentUser.role, currentUser.assignedLocation]);

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
      title: "Pending Settlement",
      value: formatCurrency(metrics.pendingSettlement),
      subtitle: `${metrics.unpaidCount} unpaid violation${metrics.unpaidCount === 1 ? "" : "s"}`,
    },
    {
      title: "Awaiting Verification",
      value: String(metrics.awaitingVerification),
      subtitle: "Submitted payments",
    },
    {
      title: "Verified",
      value: String(metrics.verified),
      subtitle: "",
    },
    {
      title: "Overdue",
      value: String(metrics.overdue),
      subtitle: `Unpaid past ${PAYMENT_DUE_HOURS} hrs`,
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
              <p className="sidebar-brand-role">
                Finance Staff
                {/* ⚠️ BAGO: Location indicator */}
                {currentUser.assignedLocationName && (
                  <span className="sidebar-brand-location">
                    {" · "}
                    {currentUser.assignedLocationName}
                  </span>
                )}
              </p>
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
                      {currentUser.assignedLocationName && ` · ${currentUser.assignedLocationName}`}
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
            {/* METRIC CARDS (4 columns) */}
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

            {/* REVENUE CHART */}
            <div className="card">
              <p className="card-eyebrow">Sector 3 · Last 7 days</p>
              <h2 className="card-title">Revenue by day</h2>

              <ResponsiveContainer width="100%" height={260}>
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
                    formatter={(value) => formatCurrency(Number(value))}
                    cursor={{ fill: "rgba(59, 130, 246, 0.08)" }}
                  />
                  <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={60} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* PAYMENT VERIFICATION */}
            <div className="card">
              <p className="card-eyebrow">Sector 3</p>
              <h2 className="card-title">Payment Verification</h2>

              {loading || !userReady ? (
                <div className="table-loading">
                  <p>Loading payments...</p>
                </div>
              ) : pendingPayments.length === 0 ? (
                <div className="table-empty">
                  <p>No pending payments.</p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Reference</th>
                        <th>CIN</th>
                        <th>Plate No.</th>
                        <th>Amount</th>
                        <th>Method</th>
                        <th>Priority</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingPayments.map((row) => (
                        <tr key={row.id}>
                          <td className="cell-reference">{row.reference}</td>
                          <td>
                            <span className="cin-pill">{row.cin}</span>
                          </td>
                          <td className="cell-plate">{row.plateNo}</td>
                          <td className="cell-amount">{formatCurrency(row.amount)}</td>
                          <td className="cell-method">{row.method}</td>
                          <td>
                            <span className={`priority-pill ${getPriorityClass(row.priority)}`}>
                              {row.priority}
                            </span>
                          </td>
                          <td className="cell-actions">
                            {/* Approve/Reject ay sa Payment Verification page —
                                doon ang segregation-of-duties check, rejection
                                reason, OR, at pag-update ng payment record. */}
                            <button
                              type="button"
                              className="btn-approve"
                              onClick={() => navigate("/finance/verification")}
                            >
                              Review
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