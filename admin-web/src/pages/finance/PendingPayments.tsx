import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, ChevronLeft, ChevronRight, X, Search } from "lucide-react";
import { signOut as firebaseSignOut } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import { useStaffProfile } from "../../lib/useStaffProfile";
import "./PendingPayments.css";
import CashPaymentSlip from "../../components/CashPaymentSlip";

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

/* ------------------------------------------------------------------
  TYPES
------------------------------------------------------------------ */
type RoleSlug = "finance";

// ⚠️ WALANG "Both" — dalawa lang
type AssignedLocation = "City Hall" | "Central";

type CurrentUser = {
  name: string;
  role: RoleSlug;
  assignedLocation: AssignedLocation | null;   // "City Hall" | "Central" — para sa payment
  assignedLocationName: string | null;         // buong pangalan — para sa display
};

type PendingStatus = "Unpaid" | "Overdue";

type PaymentLocation = "Central" | "City Hall";

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
  impoundStatus: string | null;
  impoundAutoFlagged: boolean;
  impoundFlaggedBy: string | null;
  violatorUid: string | null;
  guestId: string | null;
  violatorName: string | null;
  paymentLocation: PaymentLocation | null;   // ⚠️ BAGO
};

type NavItem = { label: string; icon: string; path: string; active?: boolean };
type NavGroup = { label: string; items: NavItem[] };

type StatusFilter = "All" | "Unpaid" | "Overdue" | "Subject to Impound" | "Impounded";
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

const ROLE_LABELS: Record<RoleSlug, string> = {
  finance: "Finance Staff",
};

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "oldest", label: "Oldest First" },
  { value: "newest", label: "Newest First" },
  { value: "amount-high", label: "Amount (High → Low)" },
  { value: "amount-low", label: "Amount (Low → High)" },
  { value: "plate-asc", label: "Plate No. (A → Z)" },
];

const STATUS_FILTERS: StatusFilter[] = [
  "All",
  "Unpaid",
  "Overdue",
  "Subject to Impound",
  "Impounded",
];

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

/** ⚠️ BAGO: Derive payment location from violation data */
const derivePaymentLocation = (data: any): PaymentLocation | null => {
  const raw = String(data.paymentLocation ?? data.location ?? "").toLowerCase();
  if (raw.includes("city") || raw.includes("hall")) return "City Hall";
  if (raw.includes("central") || raw.includes("mtpb")) return "Central";
  return null; // walang naka-set pa — violator hindi pa nagbabayad
};

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
  RECORD CASH PAYMENT (Finance)
------------------------------------------------------------------ */
const recordCashPaymentFinance = async (params: {
  violationId: string;
  cin: string;
  plateNo: string;
  amountDue: number;
  paymentLocation: PaymentLocation;
  violatorUid: string | null;
  guestId: string | null;
  violatorName: string | null;
  officerName: string;
}): Promise<{ referenceNumber: string; orNumber: string; paymentId: string }> => {
  const year = new Date().getFullYear();
  const counterRef = doc(db, "counters", "paymentReference");
  const orCounterRef = doc(db, "counters", "orNumber");
  const violationRef = doc(db, "violations", params.violationId);
  const paymentRef = doc(collection(db, "payments"));
  const auditRef = doc(collection(db, "auditLogs"));

  return runTransaction(db, async (tx) => {
    /* Step 1: Reference Number */
    const counterSnap = await tx.get(counterRef);
    const lastRef = counterSnap.exists()
      ? Number(counterSnap.data().lastValue ?? 0)
      : 0;
    const nextRef = lastRef + 1;
    const referenceNumber = `REF-${year}-${String(nextRef).padStart(5, "0")}`;

    /* Step 2: OR Number */
    const orCounterSnap = await tx.get(orCounterRef);
    const lastOr = orCounterSnap.exists()
      ? Number(orCounterSnap.data().lastValue ?? 0)
      : 0;
    const nextOr = lastOr + 1;
    const orNumber = `OR-${year}-${String(nextOr).padStart(5, "0")}`;

    /* Step 3: Persist both counters */
    tx.set(
      counterRef,
      { lastValue: nextRef, prefix: "REF", updatedAt: serverTimestamp() },
      { merge: true }
    );

    tx.set(
      orCounterRef,
      { lastValue: nextOr, prefix: "OR", updatedAt: serverTimestamp() },
      { merge: true }
    );

    /* Step 4: Update violation */
    tx.update(violationRef, {
      paymentStatus: "Pending Verification",
      paymentMethod: "Cash",
      paymentReference: referenceNumber,
      referenceNumber,
      orNumber,
      totalPaid: params.amountDue,
      cashReceived: params.amountDue,
      cashChange: 0,
      amountInWords: numberToWords(params.amountDue),
      paymentLocation: params.paymentLocation,
      paidAt: serverTimestamp(),
      cashRecordedBy: params.officerName,
      cashRecordedByRole: "finance",
      orIssuedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: params.officerName,
      violatorUid: params.violatorUid,
      guestId: params.guestId,
      violatorName: params.violatorName,
    });

    /* Step 5: Create payment record */
    tx.set(paymentRef, {
      violationId: params.violationId,
      cin: params.cin,
      plateNo: params.plateNo,
      violatorUid: params.violatorUid,
      guestId: params.guestId,
      violatorName: params.violatorName,
      amount: params.amountDue,
      convenienceFee: 0,
      totalAmount: params.amountDue,
      cashReceived: params.amountDue,
      amountInWords: numberToWords(params.amountDue),
      referenceNumber,
      orNumber,
      paymentLocation: params.paymentLocation,
      method: "Cash",
      status: "Pending Verification",
      verificationStatus: null,
      recordedBy: params.officerName,
      recordedByRole: "finance",
      createdAt: serverTimestamp(),
      orIssuedAt: serverTimestamp(),
      orIssuedBy: params.officerName,
    });

    /* Step 6: Audit log */
    tx.set(auditRef, {
      userName: params.officerName,
      userRole: "finance",
      action: `recorded cash payment for ${params.cin} — OR #${orNumber}, Ref ${referenceNumber}, Location: ${params.paymentLocation}`,
      record: params.cin,
      type: "cash-payment",
      metadata: {
        cin: params.cin,
        plateNo: params.plateNo,
        amountDue: params.amountDue,
        amountInWords: numberToWords(params.amountDue),
        referenceNumber,
        orNumber,
        paymentLocation: params.paymentLocation,
        paymentId: paymentRef.id,
        violatorUid: params.violatorUid,
        guestId: params.guestId,
        violatorName: params.violatorName,
      },
      timestamp: serverTimestamp(),
    });

    return {
      referenceNumber,
      orNumber,
      paymentId: paymentRef.id,
    };
  });
};

/* ------------------------------------------------------------------
  COMPONENT: PendingPaymentsFinance
------------------------------------------------------------------ */
export default function PendingPaymentsFinance() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  /* Profile ng naka-login na staff — naka-cache sa lahat ng Finance pages,
     kaya hindi na nagfi-flash ang data ng ibang location paglipat ng tab. */
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

  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  /* Search + Filter state */
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

  /* Effect: Fetch pending payments (paymentStatus == "Unpaid") */
  useEffect(() => {
    const q = query(
      collection(db, "violations"),
      where("paymentStatus", "==", "Unpaid")
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        let pending: PendingRow[] = snap.docs
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
              impoundStatus: data.impoundStatus ?? null,
              impoundAutoFlagged: data.impoundAutoFlagged ?? false,
              impoundFlaggedBy: data.impoundFlaggedBy ?? null,
              violatorUid: data.violatorUid ?? null,
              guestId: data.guestId ?? null,
              violatorName: data.violatorName ?? null,
              paymentLocation: derivePaymentLocation(data),   // ⚠️ BAGO
            };
          })
          .sort((a, b) => {
            const at = a.recordedAt?.toMillis() ?? 0;
            const bt = b.recordedAt?.toMillis() ?? 0;
            return at - bt;
          });

        // ⚠️ BAGO: Location-based filtering para sa Finance
        // Ang Finance (City Hall) ay makikita lang ang City Hall violations
        // Ang Finance (Central) ay makikita lang ang Central violations
        // Pero — dahil "Unpaid" pa lang, wala pang location. Base sa
        // assignedLocation ng Finance, hindi pa ito applicable.
        // Ang location-based filtering ay applicable lang sa
        // Payment Verification page (kung saan may location na).
        // Kaya dito, walang filter — lahat ng Unpaid ay nakikita.

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
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* Handler: Sign out */
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
    setIsMenuOpen(false);
  };

  /* PAYMENT LOCATION — automatic, galing sa assignedLocation ng naka-login
     na Finance staff (users/{uid}.assignedLocation). Hindi na pinipili. */
  const paymentLocation: PaymentLocation | null = currentUser.assignedLocation;

  /* CASH PAYMENT MODAL HANDLERS */
  const openCashModal = (row: PendingRow) => {
    setCashRow(row);
    setCashError("");
    setSavedReference(null);
    setSavedOrNumber(null);
    setSavedPaymentId(null);
    setShowPrintSlip(false);
  };

  const closeCashModal = () => {
    setCashRow(null);
    setCashError("");
    setSavedReference(null);
    setSavedOrNumber(null);
    setSavedPaymentId(null);
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

    setSaving(true);
    try {
      const result = await recordCashPaymentFinance({
        violationId: cashRow.id,
        cin: cashRow.cin,
        plateNo: cashRow.plateNo,
        amountDue: cashRow.amount,
        paymentLocation,
        violatorUid: cashRow.violatorUid || null,
        guestId: cashRow.guestId || null,
        violatorName: cashRow.violatorName || null,
        officerName: currentUser.name,
      });

      setSavedReference(result.referenceNumber);
      setSavedOrNumber(result.orNumber);
      setSavedPaymentId(result.paymentId);
    } catch (err: any) {
      console.error("Cash payment failed:", err);
      setCashError(err.message || "Failed to record cash payment.");
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
          row.violationNo.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== "All") {
      result = result.filter((row) => {
        if (statusFilter === "Unpaid") return row.status === "Unpaid";
        if (statusFilter === "Overdue") return row.status === "Overdue";
        if (statusFilter === "Subject to Impound")
          return row.impoundStatus === "Subject to Impound";
        if (statusFilter === "Impounded")
          return row.impoundStatus === "Impounded";
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
    const overdue = rows.filter((r) => r.daysLeft < 0).length;
    const dueToday = rows.filter((r) => r.daysLeft === 0).length;
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

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, sortOption]);

  return (
    <div className="finance-page finance-pending-page">
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
                    placeholder="Search by CIN, plate no., or violation no..."
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
                            <td className="cell-violation-no">{row.violationNo}</td>
                            <td>
                              <span className="cin-pill">{row.cin}</span>
                            </td>
                            <td className="cell-plate">{row.plateNo}</td>
                            <td className="cell-amount">{formatCurrency(row.amount)}</td>
                            <td className="cell-due-date">{formatDate(row.dueDate)}</td>
                            <td className={`cell-days-left ${row.daysLeft < 0 ? "text-red" : ""}`}>
                              {row.daysLeft < 0
                                ? "Overdue"
                                : `${row.daysLeft} day${row.daysLeft === 1 ? "" : "s"}`}
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

                              {row.impoundStatus === "Subject to Impound" && (
                                <span
                                  className={`badge-impound ${
                                    row.impoundAutoFlagged ? "badge-impound-auto" : ""
                                  }`}
                                  title={
                                    row.impoundAutoFlagged
                                      ? "Automatically flagged by system (24hr grace period expired)"
                                      : `Flagged by ${row.impoundFlaggedBy ?? "OIC"}`
                                  }
                                >
                                  {row.impoundAutoFlagged ? "🤖 Auto-flagged" : "Subject to Impound"}
                                </span>
                              )}

                              {row.impoundStatus === "Impounded" && (
                                <span className="badge-impounded">Impounded</span>
                              )}
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
              <button
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
                      <span>Cash Received</span>
                      <strong className="cash-summary-amount">
                        {formatCurrency(cashRow.amount)}
                      </strong>
                    </div>
                  </div>

                  {/* PAYMENT LOCATION — automatic (assignedLocation ng staff) */}
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

                  {/* OR NUMBER — Auto-generated */}
                  <div className="form-group">
                    <label>OR Number</label>
                    <div className="read-only-field">Auto-generated on save</div>
                    <small className="form-hint">
                      The OR number is auto-generated by the system. In production, this
                      will be replaced by the BIR-issued OR.
                    </small>
                  </div>

                  {cashError && <p className="form-error">{cashError}</p>}

                  <p className="modal-note">
                    Recorded by <strong>{currentUser.name}</strong> (Finance). The
                    violation moves to Payment Verification for confirmation by a
                    different staff member.
                  </p>
                </>
              )}
            </div>

            <div className="modal-footer">
              {savedReference ? (
                <>
                  <button className="btn-secondary" onClick={closeCashModal}>
                    Skip Print
                  </button>
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
                    {saving ? "Saving..." : "Confirm Payment"}
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
          amount={cashRow.amount}
          totalAmount={cashRow.amount}
          orNumber={savedOrNumber || ""}
          recordedBy={currentUser.name}
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