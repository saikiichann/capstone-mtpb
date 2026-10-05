import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, ChevronLeft, ChevronRight, X } from "lucide-react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./PendingPayments.css";

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

type PendingStatus = "Unpaid" | "Overdue";

type PendingRow = {
  id: string;
  violationNo: string;
  cin: string;
  plateNo: string;
  amount: number;
  recordedAt: Timestamp | null;
  dueDate: Timestamp | null;
  daysLeft: number;
  status: PendingStatus;
};

type NavItem = { label: string; icon: string; path: string; active?: boolean };
type NavGroup = { label: string; items: NavItem[] };

/* ------------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------------ */
const ITEMS_PER_PAGE = 10;
const PAYMENT_DUE_HOURS = 72;

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
        active: true,
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
      { label: "Revenue Reports", icon: revenueIcon, path: "/dashboard/revenue" },
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
   HELPERS — identical to the Finance version. This is shared business
   logic (fine amounts, due-date rules, the cash-recording transaction);
   it must not diverge just because a different role's page calls it.
------------------------------------------------------------------ */
const formatCurrency = (amount: number): string =>
  `₱${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (ts: Timestamp | null): string => {
  if (!ts) return "—";
  try {
    return ts.toDate().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
};

const computeDaysLeft = (ts: Timestamp | null): number => {
  if (!ts) return 0;
  try {
    return Math.ceil((ts.toDate().getTime() - new Date().getTime()) / 86400000);
  } catch {
    return 0;
  }
};

const getStatusClass = (status: PendingStatus): string =>
  status === "Overdue" ? "status-overdue" : "status-unpaid";

const generateViolationNo = (cin: string): string => {
  if (!cin || cin === "—") return "—";
  const match = cin.match(/(\d+)$/);
  if (!match) return cin;
  const prefix = cin.startsWith("IMP") ? "IM" : "CL";
  return `${prefix}-${match[1].padStart(5, "0")}`;
};

/**
 * Records a cash payment received over the counter — by Finance, or now
 * also by the OIC as a backup when Finance isn't available.
 *
 * This moves the violation to "Pending Verification", never straight to
 * "Verified" — Finance still has to confirm it on Payment Verification
 * afterward. That keeps two-person control intact even with OIC able to
 * record: OIC records, Finance verifies, still two different people. Only
 * the recorder's identity changes; the verification step is untouched.
 */
const recordCashPayment = async (params: {
  violationId: string;
  cin: string;
  plateNo: string;
  amountDue: number;
  cashReceived: number;
  officerName: string;
}): Promise<string> => {
  const year = new Date().getFullYear();
  const counterRef = doc(db, "counters", "paymentReference");
  const violationRef = doc(db, "violations", params.violationId);
  const paymentRef = doc(collection(db, "payments"));
  const auditRef = doc(collection(db, "auditLogs"));

  return runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const last = counterSnap.exists() ? Number(counterSnap.data().lastValue ?? 0) : 0;
    const next = last + 1;
    const referenceNumber = `REF-${year}-${String(next).padStart(5, "0")}`;

    tx.set(
      counterRef,
      { lastValue: next, prefix: "REF", updatedAt: serverTimestamp() },
      { merge: true }
    );

    tx.update(violationRef, {
      paymentStatus: "Pending Verification",
      paymentMethod: "Cash",
      paymentReference: referenceNumber,
      referenceNumber,
      totalPaid: params.amountDue,
      cashReceived: params.cashReceived,
      cashChange: params.cashReceived - params.amountDue,
      paidAt: serverTimestamp(),
      cashRecordedBy: params.officerName,
      updatedAt: serverTimestamp(),
      updatedBy: params.officerName,
    });

    tx.set(paymentRef, {
      violationId: params.violationId,
      cin: params.cin,
      amount: params.amountDue,
      convenienceFee: 0,
      totalAmount: params.amountDue,
      cashReceived: params.cashReceived,
      referenceNumber,
      method: "Cash",
      status: "pending",
      recordedBy: params.officerName,
      createdAt: serverTimestamp(),
    });

    tx.set(auditRef, {
      userName: params.officerName,
      action: `recorded cash payment for ${params.cin}`,
      record: params.cin,
      type: "cash-payment",
      metadata: {
        cin: params.cin,
        plateNo: params.plateNo,
        amountDue: params.amountDue,
        cashReceived: params.cashReceived,
        referenceNumber,
      },
      timestamp: serverTimestamp(),
    });

    return referenceNumber;
  });
};

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function PendingPayments() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "oic",
  });

  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  // Cash payment modal
  const [cashRow, setCashRow] = useState<PendingRow | null>(null);
  const [cashInput, setCashInput] = useState("");
  const [cashError, setCashError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedReference, setSavedReference] = useState<string | null>(null);

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

  useEffect(() => {
    const q = query(
      collection(db, "violations"),
      where("paymentStatus", "==", "Unpaid")
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const pending: PendingRow[] = snap.docs
          .map((d) => {
            const data = d.data();
            const recordedAt = (data.recordedAt as Timestamp) ?? null;

            let dueDate: Timestamp | null = null;
            if (recordedAt) {
              try {
                dueDate = Timestamp.fromDate(
                  new Date(
                    recordedAt.toDate().getTime() +
                      PAYMENT_DUE_HOURS * 3600 * 1000
                  )
                );
              } catch {
                dueDate = null;
              }
            }

            const daysLeft = computeDaysLeft(dueDate);
            const cin = data.cin ?? "—";

            return {
              id: d.id,
              violationNo: generateViolationNo(cin),
              cin,
              plateNo: data.plateNo ?? "—",
              amount: Number(data.fineAmount ?? 0),
              recordedAt,
              dueDate,
              daysLeft,
              status: (daysLeft < 0 ? "Overdue" : "Unpaid") as PendingStatus,
            };
          })
          .sort((a, b) => {
            const at = a.recordedAt?.toMillis() ?? 0;
            const bt = b.recordedAt?.toMillis() ?? 0;
            return at - bt;
          });

        setRows(pending);
        setLoading(false);
      },
      (err) => {
        console.warn("Pending payments fetch failed:", err.code);
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

  /** Kept for consistency with the other OIC pages even though this route
   *  is OIC-only (Supervisor never reaches it) — see App.tsx. */
  const navGroups = useMemo(
    () =>
      NAV_GROUPS.filter(
        (group) =>
          !(currentUser.role === "supervisor" && group.label === "Payment/Finance")
      ),
    [currentUser.role]
  );

  /* Cash modal */
  const openCashModal = (row: PendingRow) => {
    setCashRow(row);
    setCashInput("");
    setCashError("");
    setSavedReference(null);
  };

  const closeCashModal = () => {
    setCashRow(null);
    setCashInput("");
    setCashError("");
    setSavedReference(null);
  };

  const cashReceived = Number(cashInput);
  const change =
    cashRow && Number.isFinite(cashReceived) && cashReceived >= cashRow.amount
      ? cashReceived - cashRow.amount
      : null;

  const handleSaveCash = async () => {
    if (!cashRow) return;
    setCashError("");

    if (!cashInput.trim()) {
      setCashError("Enter the amount of cash received.");
      return;
    }
    if (!Number.isFinite(cashReceived) || cashReceived <= 0) {
      setCashError("Enter a valid amount.");
      return;
    }
    if (cashReceived < cashRow.amount) {
      setCashError(
        `Cash received is short by ${formatCurrency(
          cashRow.amount - cashReceived
        )}. Partial payments are not supported.`
      );
      return;
    }

    setSaving(true);
    try {
      const reference = await recordCashPayment({
        violationId: cashRow.id,
        cin: cashRow.cin,
        plateNo: cashRow.plateNo,
        amountDue: cashRow.amount,
        cashReceived,
        officerName: currentUser.name,
      });
      setSavedReference(reference);
    } catch (err: any) {
      console.error("Cash payment failed:", err);
      setCashError(err.message || "Failed to record cash payment.");
    } finally {
      setSaving(false);
    }
  };

  /* Metrics */
  const metrics = useMemo(() => {
    const totalPending = rows.length;
    const overdue = rows.filter((r) => r.daysLeft < 0).length;
    const dueToday = rows.filter((r) => r.daysLeft === 0).length;
    return { totalPending, overdue, dueToday };
  }, [rows]);

  const metricCards = [
    { title: "Total Pending", value: String(metrics.totalPending) },
    {
      title: `Overdue (${PAYMENT_DUE_HOURS}hr+)`,
      value: String(metrics.overdue),
    },
    { title: "Due Today", value: String(metrics.dueToday) },
  ];

  /* Pagination */
  const totalPages = Math.max(1, Math.ceil(rows.length / ITEMS_PER_PAGE));
  // Clamped during render instead of a corrective useEffect — same fix
  // applied to ClampingLog.tsx / ImpoundingLog.tsx / ActiveImpounding.tsx.
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = rows.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return (
    <div className="oic-page pending-payments-page">
      <div className="dashboard">
        {/* SIDEBAR */}
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

        {/* MAIN CONTENT */}
        <div className="main">
          <header className="main-header">
            <div>
              <h1>Pending Payments</h1>
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
            <div className="metric-grid-three">
              {metricCards.map((card) => (
                <div key={card.title} className="card metric-card">
                  <p className="metric-title">{card.title}</p>
                  <p className="metric-value">{card.value}</p>
                </div>
              ))}
            </div>

            {/* TABLE */}
            <div className="card">
              <p className="card-eyebrow">Sector 3</p>
              <h2 className="card-title">Pending Payments</h2>

              {loading ? (
                <div className="table-loading">
                  <p>Loading pending payments...</p>
                </div>
              ) : rows.length === 0 ? (
                <div className="table-empty">
                  <p>No pending payments.</p>
                </div>
              ) : (
                <>
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Violation No.</th>
                          <th>CIN</th>
                          <th>Plate No.</th>
                          <th>Amount</th>
                          <th>Due Date</th>
                          <th>Days Left</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedRows.map((row) => (
                          <tr key={row.id}>
                            <td className="cell-violation-no">
                              {row.violationNo}
                            </td>
                            <td>
                              <span className="cin-pill">{row.cin}</span>
                            </td>
                            <td className="cell-plate">{row.plateNo}</td>
                            <td className="cell-amount">
                              {formatCurrency(row.amount)}
                            </td>
                            <td className="cell-due-date">
                              {formatDate(row.dueDate)}
                            </td>
                            <td
                              className={`cell-days-left ${
                                row.daysLeft < 0 ? "text-red" : ""
                              }`}
                            >
                              {row.daysLeft < 0
                                ? "Overdue"
                                : `${row.daysLeft} day${
                                    row.daysLeft === 1 ? "" : "s"
                                  }`}
                            </td>
                            <td>
                              <span
                                className={`status-pill ${getStatusClass(
                                  row.status
                                )}`}
                              >
                                {row.status}
                              </span>
                            </td>
                            <td className="cell-action">
                              <button
                                type="button"
                                className="btn-cash-payment"
                                onClick={() => openCashModal(row)}
                              >
                                Cash Payment
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* PAGINATION */}
                  <div className="pagination">
                    <button
                      type="button"
                      className="pagination-btn"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                    >
                      <ChevronLeft size={16} />
                      Previous
                    </button>

                    <div className="pagination-info">
                      <span className="pagination-page">{safePage}</span>
                      <span className="pagination-sep">
                        of {totalPages} pages
                      </span>
                    </div>

                    <button
                      type="button"
                      className="pagination-btn"
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={safePage === totalPages}
                    >
                      Next
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* CASH PAYMENT MODAL */}
      {cashRow && (
        <div className="modal-overlay" onClick={closeCashModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                Cash Payment — {cashRow.violationNo}
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={closeCashModal}
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {savedReference ? (
                <>
                  <div className="cash-reference-box cash-reference-saved">
                    <p className="cash-reference-label">Reference No.</p>
                    <p className="cash-reference-value">{savedReference}</p>
                  </div>
                  <p className="cash-saved-note">
                    Cash payment recorded. {cashRow.cin} now appears under
                    Payment Verification for confirmation.
                  </p>
                  {change !== null && change > 0 && (
                    <p className="cash-change-line">
                      Change due to violator:{" "}
                      <strong>{formatCurrency(change)}</strong>
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="cash-summary">
                    <div className="cash-summary-row">
                      <span>CIN</span>
                      <strong>{cashRow.cin}</strong>
                    </div>
                    <div className="cash-summary-row">
                      <span>Plate No.</span>
                      <strong>{cashRow.plateNo}</strong>
                    </div>
                    <div className="cash-summary-row">
                      <span>Amount Due</span>
                      <strong>{formatCurrency(cashRow.amount)}</strong>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="cashReceived">Cash Received (₱)</label>
                    <input
                      id="cashReceived"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      className="form-input"
                      placeholder="Amount"
                      value={cashInput}
                      onChange={(e) => {
                        setCashInput(e.target.value);
                        setCashError("");
                      }}
                      disabled={saving}
                      autoFocus
                    />
                  </div>

                  {change !== null && (
                    <p className="cash-change-line">
                      Change: <strong>{formatCurrency(change)}</strong>
                    </p>
                  )}

                  {cashError && <p className="form-error">{cashError}</p>}

                  <p className="modal-note">
                    The reference number is generated when you save. The
                    violation moves to Payment Verification, not straight to
                    Verified.
                  </p>
                </>
              )}
            </div>

            <div className="modal-footer">
              {savedReference ? (
                <button className="btn-primary" onClick={closeCashModal}>
                  Done
                </button>
              ) : (
                <>
                  <button
                    className="btn-secondary"
                    onClick={closeCashModal}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary"
                    onClick={handleSaveCash}
                    disabled={saving || !cashInput.trim()}
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}