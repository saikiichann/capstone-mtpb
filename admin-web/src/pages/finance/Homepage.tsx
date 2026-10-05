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
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
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

type CurrentUser = {
  name: string;
  role: RoleSlug;
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
};

type Metrics = {
  pendingSettlement: number;
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

const INITIAL_METRICS: Metrics = {
  pendingSettlement: 0,
  awaitingVerification: 0,
  verified: 0,
  overdue: 0,
};

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

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------
export default function FinanceHomepage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "finance",
  });

  const [metrics, setMetrics] = useState<Metrics>(INITIAL_METRICS);
  const [pendingPayments, setPendingPayments] = useState<PaymentRow[]>([]);
  const [revenueData, setRevenueData] = useState<RevenuePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

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
  useEffect(() => {
    const ref = collection(db, "violations");
    const q = query(ref, orderBy("recordedAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const allPayments: (PaymentRow & { verifiedAt?: Timestamp })[] = snap.docs.map((d) => {
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
            verifiedAt: data.verifiedAt ?? null,
          };
        });

        // Compute metrics
        const newMetrics: Metrics = { ...INITIAL_METRICS };
        let pendingSum = 0;

        allPayments.forEach((p) => {
          if (p.status === "Unpaid") {
            newMetrics.pendingSettlement += p.amount;
          }
          if (p.status === "Pending Verification") {
            newMetrics.awaitingVerification++;
          }
          if (p.status === "Verified") {
            newMetrics.verified++;
          }
          if (p.status === "Rejected") {
            newMetrics.overdue++;
          }
        });

        setMetrics(newMetrics);

        // Table only shows pending verification (max 10)
        const pendingOnly = allPayments
          .filter((p) => p.status === "Pending Verification")
          .slice(0, 10);
        setPendingPayments(pendingOnly);

        // Compute revenue last 7 days (from Verified violations)
        const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const revenueMap: Record<string, number> = {};
        days.forEach((d) => (revenueMap[d] = 0));

        const today = new Date();
        allPayments.forEach((p) => {
          if (p.status === "Verified" && p.verifiedAt) {
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

        const revenueArr: RevenuePoint[] = days.map((day) => ({
          day,
          value: revenueMap[day],
        }));
        setRevenueData(revenueArr);
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

  const handlePaymentAction = async (
    row: PaymentRow,
    action: "Verified" | "Rejected"
  ) => {
    setActioning(row.id);

    try {
      const violationRef = doc(db, "violations", row.id);
      const violationSnap = await getDoc(violationRef);
      const violationData = violationSnap.data();

      // 1. Update violations doc
      await updateDoc(violationRef, {
        paymentStatus: action,
        verifiedBy: currentUser.name,
        verifiedAt: serverTimestamp(),
      });

      // 2. If verified, update clamps doc
      if (action === "Verified" && violationData) {
        let clampId: string | null = null;
        if (violationData.clampId) clampId = violationData.clampId;
        else if (violationData.clampQrId) clampId = violationData.clampQrId;

        if (clampId) {
          const clampQuery = query(
            collection(db, "clamps"),
            where("clampId", "==", clampId)
          );
          const clampSnap = await getDocs(clampQuery);

          if (!clampSnap.empty) {
            const clampDocRef = clampSnap.docs[0].ref;
            await updateDoc(clampDocRef, {
              status: "paid",
              paidAt: serverTimestamp(),
            });
          }
        }
      }

      // 3. Log to auditLogs
      await addDoc(collection(db, "auditLogs"), {
        userName: currentUser.name,
        action: `${action === "Verified" ? "approved" : "rejected"} payment ${row.cin}`,
        record: row.cin,
        type: "payment-verification",
        metadata: {
          cin: row.cin,
          amount: row.amount,
          method: row.method,
          newStatus: action,
        },
        timestamp: serverTimestamp(),
      });

      console.log(`Violation ${row.cin} payment ${action}.`);
    } catch (err: any) {
      console.error("Error updating payment:", err);
      alert(err.message || "Failed to update payment.");
    } finally {
      setActioning(null);
    }
  };

  const metricCards = [
    {
      title: "Pending Settlement",
      value: formatCurrency(metrics.pendingSettlement),
      subtitle: `${pendingPayments.length} unpaid violations`,
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
      subtitle: "Past due date",
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
                    formatter={(value: number) => formatCurrency(value)}
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

              {loading ? (
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
                            <button
                              type="button"
                              className="btn-approve"
                              onClick={() => handlePaymentAction(row, "Verified")}
                              disabled={actioning === row.id}
                            >
                              {actioning === row.id ? "..." : "Approve"}
                            </button>
                            <button
                              type="button"
                              className="btn-reject"
                              onClick={() => handlePaymentAction(row, "Rejected")}
                              disabled={actioning === row.id}
                            >
                              {actioning === row.id ? "..." : "Reject"}
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