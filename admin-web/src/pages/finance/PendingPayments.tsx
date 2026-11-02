import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, X, Search } from "lucide-react";
import {
  collection,
  onSnapshot,
  query,
  where,
  Timestamp,
  type DocumentData
} from "firebase/firestore";
import { db } from "../../firebase";
import { useRegisteredOwners } from "../../lib/registeredOwners";
import { useStaffProfile } from "../../lib/useStaffProfile";
import { amountDueFor, overdueFeeFor } from "../../lib/clampFee";
import { impoundFeeDue, isImpoundViolation } from "../../lib/impoundFlag";
import "./PendingPayments.css";
import CashPaymentSlip from "../../components/CashPaymentSlip";
import { recordOnsitePayment } from "../../lib/onsitePayment";

// Asset imports
import overviewIcon from "../../assets/overview.png";
import pendingPaymentsIcon from "../../assets/pendingpayments.png";
import paymentVerificationIcon from "../../assets/paymentverification.png";
import transactionIcon from "../../assets/transaction.png";
import revenueIcon from "../../assets/revenue.png";
import allReportsIcon from "../../assets/reports.png";
import exportCenterIcon from "../../assets/export.png";
import AppTopbar from "../../components/AppTopbar";
import AppSidebar from "../../components/AppSidebar";

/* ------------------------------------------------------------------
  TYPES
------------------------------------------------------------------ */
type RoleSlug = "finance";

type AssignedLocation = "City Hall" | "Central";

type CurrentUser = {
  name: string;
  role: RoleSlug;
  assignedLocation: AssignedLocation | null;
  assignedLocationName: string | null;
};

type PendingStatus = "Unpaid" | "Overdue";

type PaymentLocation = "Central" | "City Hall";

type PendingRow = {
  id: string;
  violationNo: string;
  cin: string;
  uovrNo: string | null; /** UOVR No. — for impounded */
  plateNo: string;
  fineAmount: number; 
  overdueFee: number; /** ₱2,000 once the clamp is past 24 hours (replaces the fine), else 0 */
  impoundFee: number; /** Impound fee if impounded (per weight class + per km). 0 if clamp only. */
  impounded: boolean;  /** True if it is impounded (impounded o released) */
  amount: number;
  recordedAt: Timestamp | null;
  dueDate: Timestamp | null;
  daysLeft: number;
  status: PendingStatus;
  violatorUid: string | null;
  guestId: string | null;
  violatorName: string | null;
  location: string | null;
  paymentLocation: PaymentLocation | null;
};

type NavItem = { label: string; icon: string; path: string; active?: boolean };
type NavGroup = { label: string; items: NavItem[] };

type StatusFilter = "All" | "Unpaid" | "Overdue";
type SortOption = "oldest" | "newest" | "amount-high" | "amount-low" | "plate-asc";

/* ------------------------------------------------------------------
  CONSTANTS
------------------------------------------------------------------ */
const ITEMS_PER_PAGE = 10;
const PAYMENT_DUE_HOURS = 24;

const PAYMENT_LOCATION_LABELS: Record<PaymentLocation, string> = {
  Central: "Central (MTPB Office)",
  "City Hall": "City Hall",
};


const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "oldest", label: "Oldest First" },
  { value: "newest", label: "Newest First" },
  { value: "amount-high", label: "Amount (High → Low)" },
  { value: "amount-low", label: "Amount (Low → High)" },
  { value: "plate-asc", label: "Plate No. (A → Z)" },
];

const STATUS_FILTERS: StatusFilter[] = ["All", "Unpaid", "Overdue"];

/* ------------------------------------------------------------------
  FINANCE SIDEBAR
------------------------------------------------------------------ */
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Dashboard",
    items: [{ label: "Overview", icon: overviewIcon, path: "/finance" }],
  },
  {
    label: "Payment/Finance",
    items: [
      {
        label: "Pending Payments",
        icon: pendingPaymentsIcon,
        path: "/finance/pending",
        active: true,
      },
      {
        label: "Payment Verification",
        icon: paymentVerificationIcon,
        path: "/finance/verification",
      },
      {
        label: "Transaction History",
        icon: transactionIcon,
        path: "/finance/transactions",
      },
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

/* ------------------------------------------------------------------
  HELPERS
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
    const diffDays = (ts.toDate().getTime() - new Date().getTime()) / 86400000;
    return diffDays < 0 ? Math.floor(diffDays) : Math.ceil(diffDays);
  } catch {
    return 0;
  }
};

const isDueToday = (ts: Timestamp | null): boolean => {
  if (!ts) return false;
  try {
    const due = ts.toDate();
    const now = new Date();
    return due.getTime() >= now.getTime() && due.toDateString() === now.toDateString();
  } catch {
    return false;
  }
};

const formatTimeLeft = (ts: Timestamp | null, daysLeft: number): string => {
  if (daysLeft < 0) return "Overdue";
  if (!ts) return "—";
  try {
    const hours = Math.ceil((ts.toDate().getTime() - Date.now()) / 3600000);
    if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"}`;
  } catch {
    return "—";
  }
  return `${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
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

const derivePaymentLocation = (data: DocumentData): PaymentLocation | null => {
  const raw = String(data.paymentLocation ?? data.location ?? "").toLowerCase();
  if (raw.includes("city") || raw.includes("hall")) return "City Hall";
  if (raw.includes("central") || raw.includes("mtpb")) return "Central";
  return null;
};

const isImpounded = (data: DocumentData): boolean => isImpoundViolation(data);

const numberToWords = (num: number): string => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

  if (num === 0) return 'Zero Pesos Only';

  const pesos = Math.floor(num);
  const cents = Math.round((num - pesos) * 100);

  let words = '';
  let remaining = pesos;

  if (remaining >= 1000) {
    words += ones[Math.floor(remaining / 1000)] + ' Thousand ';
    remaining %= 1000;
  }
  if (remaining >= 100) {
    words += ones[Math.floor(remaining / 100)] + ' Hundred ';
    remaining %= 100;
  }
  if (remaining >= 20) {
    words += tens[Math.floor(remaining / 10)] + ' ';
    remaining %= 10;
  } else if (remaining >= 10) {
    words += teens[remaining - 10] + ' ';
    remaining = 0;
  }
  if (remaining > 0) {
    words += ones[remaining] + ' ';
  }

  words = words.trim() + ' Pesos';
  if (cents > 0) {
    words += ` and ${cents}/100`;
  }
  return words + ' Only';
};

/* ------------------------------------------------------------------
  COMPONENT: PendingPaymentsFinance
------------------------------------------------------------------ */
export default function PendingPaymentsFinance() {

  const { profile, ready: userReady } = useStaffProfile();
  const currentUser: CurrentUser = useMemo(
    () => ({
      name: profile?.name ?? "Loading...",
      role: "finance",
      assignedLocation: profile?.assignedLocation ?? null,
      assignedLocationName: profile?.assignedLocationName ?? null,
    }),
    [profile]
  );

  const [rawRows, setRows] = useState<PendingRow[]>([]);
  const rows = useRegisteredOwners(rawRows);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [sortOption, setSortOption] = useState<SortOption>("oldest");

  /* Cash payment modal state */
  const [cashRow, setCashRow] = useState<PendingRow | null>(null);
  const [cashError, setCashError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedReference, setSavedReference] = useState<string | null>(null);
  const [savedOrNumber, setSavedOrNumber] = useState<string | null>(null);
  const [savedPaymentId, setSavedPaymentId] = useState<string | null>(null);
  const [showPrintSlip, setShowPrintSlip] = useState(false);
  const [cashGiven, setCashGiven] = useState("");
  const [savedCashReceived, setSavedCashReceived] = useState<number | null>(null);
  /** Impound: verified and released */
  const [savedReleased, setSavedReleased] = useState(false);
  const [savedReleaseOrderId, setSavedReleaseOrderId] = useState<string | null>(null);

  /* Effect: Fetch pending payments (paymentStatus == "Unpaid") */
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
            const impounded = isImpounded(data);

            // Impound fee (per weight class + per km) — 0 if clamp only
            const impoundFee = impoundFeeDue(
              data.impoundStatus,
              data.impoundFee,
              data.weightClass,
              data.distanceKm
            );

            // Clamp-related fees
            const fineAmount = Number(data.fineAmount ?? 0);
            const overdueFee = overdueFeeFor(data);
            const clampAmount = amountDueFor(data);

            // Total amount due = impound fee kung impounded, else clamp amount
            const amount = impounded && impoundFee > 0 ? impoundFee : clampAmount;

            // Due date (24 hrs from recordedAt)
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
            const status: PendingStatus = impounded
              ? "Unpaid"
              : daysLeft < 0
                ? "Overdue"
                : "Unpaid";

            return {
              id: d.id,
              violationNo: generateViolationNo(cin),
              cin,
              uovrNo: data.uovrNo ?? null,
              plateNo: data.plateNo ?? "—",
              fineAmount,
              overdueFee: impounded ? 0 : overdueFee,
              impoundFee: impounded ? impoundFee : 0,
              impounded,
              amount,
              recordedAt,
              dueDate,
              daysLeft,
              status,
              violatorUid: data.violatorUid ?? null,
              guestId: data.guestId ?? null,
              violatorName: data.violatorName ?? null,
              location: data.location ?? null,
              paymentLocation: derivePaymentLocation(data),
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

  const paymentLocation: PaymentLocation | null = currentUser.assignedLocation;

  /* CASH PAYMENT MODAL HANDLERS */
  const openCashModal = (row: PendingRow) => {
    setCashRow(row);
    setCashError("");
    setCashGiven("");
    setSavedCashReceived(null);
    setSavedReference(null);
    setSavedOrNumber(null);
    setSavedPaymentId(null);
    setSavedReleased(false);
    setSavedReleaseOrderId(null);
    setShowPrintSlip(false);
  };

  const closeCashModal = () => {
    setCashRow(null);
    setCashError("");
    setSavedReference(null);
    setSavedOrNumber(null);
    setSavedPaymentId(null);
    setSavedReleased(false);
    setSavedReleaseOrderId(null);
    setShowPrintSlip(false);
  };

  const handleSaveCash = async () => {
    if (!cashRow) return;
    setCashError("");

    if (!paymentLocation) {
      setCashError(
        "Your account has no assigned location (City Hall or Central). Ask the IT Admin to set it in User Management before recording cash payments."
      );
      return;
    }

    const cashReceivedValue = cashGiven.trim() === "" ? cashRow.amount : Number(cashGiven);
    if (!Number.isFinite(cashReceivedValue) || cashReceivedValue < cashRow.amount) {
      setCashError(`Cash received must be at least ${formatCurrency(cashRow.amount)}.`);
      return;
    }

    setSaving(true);
    try {
      const result = await recordOnsitePayment({
        violationId: cashRow.id,
        cin: cashRow.cin,
        uovrNo: cashRow.uovrNo,
        plateNo: cashRow.plateNo,
        fineAmount: cashRow.fineAmount,
        impoundFee: cashRow.impoundFee,
        isImpound: cashRow.impounded,
        location: cashRow.location,
        amountInWords: numberToWords(cashRow.amount),
        cashReceived: cashReceivedValue,
        counterLocation: paymentLocation,
        recordedByRole: "finance",
        officerName: currentUser.name,
        violatorUid: cashRow.violatorUid || null,
        guestId: cashRow.guestId || null,
        violatorName: cashRow.violatorName || null,
      });

      setSavedCashReceived(cashReceivedValue);
      setSavedReference(result.referenceNumber);
      setSavedOrNumber(result.orNumber);
      setSavedPaymentId(result.paymentId);
      setSavedReleased(result.released);
      setSavedReleaseOrderId(result.releaseOrderId);
    } catch (err) {
      console.error("Cash payment failed:", err);
      setCashError((err as Error)?.message || "Failed to record cash payment.");
    } finally {
      setSaving(false);
    }
  };

  /* FILTERED + SORTED ROWS */
  const filteredRows = useMemo(() => {
    let result = [...rows];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (row) =>
          row.cin.toLowerCase().includes(q) ||
          row.plateNo.toLowerCase().includes(q) ||
          row.violationNo.toLowerCase().includes(q) ||
          (row.uovrNo ?? "").toLowerCase().includes(q)
      );
    }

    if (statusFilter !== "All") {
      result = result.filter((row) => {
        if (statusFilter === "Unpaid") return row.status === "Unpaid";
        if (statusFilter === "Overdue") return row.status === "Overdue";
        return true;
      });
    }

    switch (sortOption) {
      case "oldest":
        result.sort((a, b) => (a.recordedAt?.toMillis() ?? 0) - (b.recordedAt?.toMillis() ?? 0));
        break;
      case "newest":
        result.sort((a, b) => (b.recordedAt?.toMillis() ?? 0) - (a.recordedAt?.toMillis() ?? 0));
        break;
      case "amount-high":
        result.sort((a, b) => b.amount - a.amount);
        break;
      case "amount-low":
        result.sort((a, b) => a.amount - b.amount);
        break;
      case "plate-asc":
        result.sort((a, b) => a.plateNo.localeCompare(b.plateNo));
        break;
    }

    return result;
  }, [rows, searchQuery, statusFilter, sortOption]);

  /* METRICS */
  const metrics = useMemo(() => {
    const totalPending = rows.length;
    const overdue = rows.filter((r) => r.status === "Overdue").length;
    const dueToday = rows.filter(
      (r) => !r.impounded && r.daysLeft >= 0 && isDueToday(r.dueDate)
    ).length;
    return { totalPending, overdue, dueToday };
  }, [rows]);

  const metricCards = [
    { title: "Total Pending", value: String(metrics.totalPending) },
    { title: `Overdue (${PAYMENT_DUE_HOURS}hr+)`, value: String(metrics.overdue) },
    { title: "Due Today", value: String(metrics.dueToday) },
  ];

  /* PAGINATION */
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = filteredRows.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // Keep the page valid if the list shrinks (during render)
  if (currentPage > totalPages) setCurrentPage(totalPages);

  // Back to page 1 when these change (during render, not in an effect)
  const pageResetKey = JSON.stringify([searchQuery, statusFilter, sortOption]);
  const [prevPageResetKey, setPrevPageResetKey] = useState(pageResetKey);
  if (pageResetKey !== prevPageResetKey) {
    setPrevPageResetKey(pageResetKey);
    setCurrentPage(1);
  }

  return (
    <div className="finance-page finance-pending-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <AppSidebar groups={NAV_GROUPS} role={<>Finance Staff
                {currentUser.assignedLocationName && (
                  <span className="sidebar-brand-location">
                    {" · "}
                    {currentUser.assignedLocationName}
                  </span>
                )}</>} />

        {/* MAIN CONTENT */}
        <div className="main">
          <AppTopbar groups={NAV_GROUPS} />
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

          </header>

          <main className="main-content">
            <div className="metric-grid-three">
              {metricCards.map((card) => (
                <div key={card.title} className="card metric-card">
                  <p className="metric-title">{card.title}</p>
                  <p className="metric-value">{card.value}</p>
                </div>
              ))}
            </div>

            <div className="card">
              <p className="card-eyebrow">Sector 3</p>
              <h2 className="card-title">Pending Payments</h2>

              {/* TOOLBAR */}
              <div className="table-toolbar">
                <div className="toolbar-search">
                  <Search size={16} className="toolbar-search-icon" />
                  <input
                    type="text"
                    className="toolbar-search-input"
                    placeholder="Search by CIN, plate no., UOVR, or violation no..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="toolbar-search-clear"
                      onClick={() => setSearchQuery("")}
                      title="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <select
                  aria-label="Filter by status"
                  className="toolbar-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                >
                  {STATUS_FILTERS.map((s) => (
                    <option key={s} value={s}>
                      {s === "All" ? "All Statuses" : s}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Sort by"
                  className="toolbar-select"
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as SortOption)}
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {!loading && userReady && rows.length > 0 && (
                <p className="toolbar-result-count">
                  Showing <strong>{filteredRows.length}</strong> of{" "}
                  <strong>{rows.length}</strong> pending payment
                  {rows.length === 1 ? "" : "s"}
                  {searchQuery || statusFilter !== "All" ? " (filtered)" : ""}
                </p>
              )}

              {loading || !userReady ? (
                <div className="table-loading">
                  <p>Loading pending payments...</p>
                </div>
              ) : rows.length === 0 ? (
                <div className="table-empty">
                  <p>No pending payments.</p>
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="table-empty">
                  <p>No payments match your search or filters.</p>
                </div>
              ) : (
                <>
                  <div className="table-wrapper" tabIndex={0} role="region" aria-label="Data table" data-scroll-region>
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
                            <td className="cell-violation-no">{row.violationNo}</td>
                            <td>
                              <span className="cin-pill">{row.cin}</span>
                            </td>
                            <td className="cell-plate">{row.plateNo}</td>
                            <td className="cell-amount">
                              {formatCurrency(row.amount)}
                              {row.impounded && row.impoundFee > 0 && (
                                <small className="amount-note">impound fee</small>
                              )}
                              {!row.impounded && row.overdueFee > 0 && (
                                <small className="amount-note">overdue clamp fee</small>
                              )}
                            </td>
                            <td className="cell-due-date">
                              {row.impounded ? "—" : formatDate(row.dueDate)}
                            </td>
                            <td className={`cell-days-left ${row.daysLeft < 0 && !row.impounded ? "text-red" : ""}`}>
                              {row.impounded ? "—" : formatTimeLeft(row.dueDate, row.daysLeft)}
                            </td>
                            <td>
                              <span className={`status-pill ${getStatusClass(row.status)}`}>
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
                      <span className="pagination-sep">of {totalPages} pages</span>
                    </div>

                    <button
                      type="button"
                      className="pagination-btn"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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
        <div className="modal-overlay" onClick={saving ? undefined : closeCashModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Cash Payment — {cashRow.violationNo}</h3>
              <button aria-label="Close"
                type="button"
                className="modal-close-btn"
                onClick={closeCashModal}
                disabled={saving}
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {savedReference ? (
                <>
                  <div className="cash-reference-box cash-reference-saved">
                    <p className="cash-reference-label">REFERENCE NO.</p>
                    <p className="cash-reference-value">{savedReference}</p>
                  </div>
                  {savedOrNumber && (
                    <div className="cash-reference-box cash-reference-saved">
                      <p className="cash-reference-label">OR NUMBER</p>
                      <p className="cash-reference-value">{savedOrNumber}</p>
                    </div>
                  )}
                  {savedReleased ? (
                    <>
                    <p className="cash-saved-note">
                      Impound payment received by <strong>{currentUser.name}</strong> (Finance). {cashRow.cin} is
                      now <strong>Verified</strong> and <strong>Released</strong>
                      {savedReleaseOrderId ? <> ({savedReleaseOrderId})</> : null} — no Payment Verification
                      or release approval needed for impound.
                    </p>
                    <p className="cash-saved-hint">
                      Next step: Print the slip. The violator presents it to claim the vehicle.
                    </p>
                    </>
                  ) : (
                    <>
                    <p className="cash-saved-note">
                      Cash payment recorded by <strong>{currentUser.name}</strong> (Finance) —{" "}
                      <strong>
                        {paymentLocation ? PAYMENT_LOCATION_LABELS[paymentLocation] : "—"}
                      </strong>. {cashRow.cin} now appears under
                      Payment Verification for confirmation by a different staff member
                      (segregation of duties).
                    </p>
                    <p className="cash-saved-hint">
                      Next step: Print the acknowledgment slip for the violator. It
                      contains a QR code that will be scanned to verify this payment.
                    </p>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="cash-ref-preview">
                    <p className="cash-ref-preview-label">REFERENCE NO.</p>
                    <p className="cash-ref-preview-hint">Generated on save</p>
                  </div>

                  <div className="cash-summary">
                    <div className="cash-summary-row">
                      <span>CIN</span>
                      <strong>{cashRow.cin}</strong>
                    </div>
                    {cashRow.uovrNo && (
                      <div className="cash-summary-row">
                        <span>UOVR No.</span>
                        <strong>{cashRow.uovrNo}</strong>
                      </div>
                    )}
                    <div className="cash-summary-row">
                      <span>Plate No.</span>
                      <strong>{cashRow.plateNo}</strong>
                    </div>
                    {cashRow.violatorName && (
                      <div className="cash-summary-row">
                        <span>Violator</span>
                        <strong>{cashRow.violatorName}</strong>
                      </div>
                    )}

                    {/* FEE BREAKDOWN — Impound o Clamp */}
                    {cashRow.impounded && cashRow.impoundFee > 0 ? (
                      <div className="cash-summary-row">
                        <span>
                          Impound Fee
                          <small className="amount-note">
                            Per weight class + distance
                          </small>
                        </span>
                        <strong>{formatCurrency(cashRow.impoundFee)}</strong>
                      </div>
                    ) : cashRow.overdueFee > 0 ? (
                      <div className="cash-summary-row">
                        <span>
                          Overdue Clamp Fee
                          <small className="amount-note">
                            Past 24 hours — replaces the {formatCurrency(cashRow.fineAmount)} fine
                          </small>
                        </span>
                        <strong>{formatCurrency(cashRow.overdueFee)}</strong>
                      </div>
                    ) : (
                      <div className="cash-summary-row">
                        <span>Fine</span>
                        <strong>{formatCurrency(cashRow.fineAmount)}</strong>
                      </div>
                    )}

                    <div className="cash-summary-row">
                      <span>Amount Due</span>
                      <strong className="cash-summary-amount">
                        {formatCurrency(cashRow.amount)}
                      </strong>
                    </div>
                    <div className="cash-summary-row">
                      <span>Amount in Words</span>
                      <strong className="cash-summary-words">
                        {numberToWords(cashRow.amount)}
                      </strong>
                    </div>
                    <div className="cash-summary-row">
                      <span>Change</span>
                      <strong className="cash-summary-amount">
                        {formatCurrency(
                          Math.max(
                            0,
                            (cashGiven.trim() === "" ? cashRow.amount : Number(cashGiven) || 0) -
                              cashRow.amount
                          )
                        )}
                      </strong>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="cashGiven">Cash Received</label>
                    <input
                      id="cashGiven"
                      className="form-input"
                      type="number"
                      inputMode="decimal"
                      min={cashRow.amount}
                      step="0.01"
                      placeholder={cashRow.amount.toFixed(2)}
                      value={cashGiven}
                      onChange={(e) => setCashGiven(e.target.value)}
                      disabled={saving}
                    />
                    <small className="form-hint">
                      Amount handed over by the payer. Leave blank if exact. GCash is paid
                      online through the violator app.
                    </small>
                  </div>

                  <div className="form-group">
                    <label>Payment Location</label>
                    <div className="read-only-field">
                      {paymentLocation
                        ? currentUser.assignedLocationName ??
                          PAYMENT_LOCATION_LABELS[paymentLocation]
                        : "No assigned location"}
                    </div>
                    <small className="form-hint">
                      {paymentLocation
                        ? "Automatically set from your assigned location."
                        : "Your account has no assigned location. Ask the IT Admin to set it in User Management."}
                    </small>
                  </div>

                  <div className="form-group">
                    <label>OR Number</label>
                    <div className="read-only-field">Auto-generated on save</div>
                    <small className="form-hint">
                      The OR number is auto-generated by the system. In production, this
                      will be replaced by the BIR-issued OR.
                    </small>
                  </div>

                  {cashError && <p className="form-error">{cashError}</p>}

                  {cashRow.impounded ? (
                    <p className="modal-note">
                      Recorded by <strong>{currentUser.name}</strong> (Finance). <strong>Impound:</strong>{" "}
                      saving verifies the payment and releases the vehicle right away.
                    </p>
                  ) : (
                    <p className="modal-note">
                      Recorded by <strong>{currentUser.name}</strong> (Finance). The
                      violation moves to Payment Verification for confirmation by a
                      different staff member.
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="modal-footer">
              {savedReference ? (
                <>
                  <button className="btn-primary" onClick={() => setShowPrintSlip(true)}>
                    🖨️ Print Slip
                  </button>
                </>
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
                    disabled={saving || !userReady || !paymentLocation}
                  >
                    {saving
                      ? "Saving..."
                      : cashRow.impounded
                        ? "Confirm Payment & Release"
                        : "Confirm Payment"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PRINT SLIP MODAL */}
      {showPrintSlip && savedPaymentId && cashRow && (
        <CashPaymentSlip
          paymentId={savedPaymentId}
          referenceNumber={savedReference || ""}
          cin={cashRow.cin}
          plateNo={cashRow.plateNo}
          amount={
            cashRow.impoundFee > 0
              ? 0
              : cashRow.overdueFee > 0
                ? 0
                : cashRow.fineAmount
          }
          overdueFee={cashRow.overdueFee}
          impoundFee={cashRow.impoundFee}
          totalAmount={cashRow.amount}
          cashReceived={savedCashReceived ?? undefined}
          orNumber={savedOrNumber || ""}
          recordedBy={currentUser.name}
          released={savedReleased}
          createdAt={new Date()}
          onClose={() => {
            setShowPrintSlip(false);
            closeCashModal();
          }}
          onPrinted={() => {
            setShowPrintSlip(false);
            closeCashModal();
          }}
        />
      )}
    </div>
  );
}