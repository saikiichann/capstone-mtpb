import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, ChevronLeft, ChevronRight, X, Search } from "lucide-react";
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
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./PendingPayments.css";
import {
  IMPOUND_FEE,
  impoundFeeDue,
  setImpoundRecord,
  setImpoundRecordInTransaction,
  useImpoundRecordIds,
  type ImpoundRecordSource,
} from "../../lib/impoundFlag";
import CashPaymentSlip from "../../components/CashPaymentSlip";
import {
  isGcashReferenceUsed,
  isValidGcashReference,
  recordOnsitePayment,
  type OnsiteMethod,
} from "../../lib/onsitePayment";

// Asset imports
import mtpbLogo from "../../assets/mtpb-logo.png";
import officerAvatar from "../../assets/user.png";
import overviewIcon from "../../assets/overview.png";
import pendingPaymentsIcon from "../../assets/pendingpayments.png";
import paymentVerificationIcon from "../../assets/paymentverification.png";
import transactionIcon from "../../assets/transaction.png";
import revenueIcon from "../../assets/revenue.png";
import clampingIcon from "../../assets/clamping.png";
import impoundingIcon from "../../assets/impounding.png";
import historyIcon from "../../assets/history.png";
import releaseRequestIcon from "../../assets/releaserequest.png";
import queueIcon from "../../assets/queue.png";
import releaseLogIcon from "../../assets/releaselog.png";
import mapIcon from "../../assets/map.png";
import sectorAnalyticsIcon from "../../assets/sectoranalytics.png";
import clampingTeamsIcon from "../../assets/clampingteams.png";
import towTruckIcon from "../../assets/tow-truck.png";
import fieldUpdateIcon from "../../assets/fieldupdate.png";
import operationSchedulerIcon from "../../assets/scheduler.png";
import logoutIcon from "../../assets/logout.png";

/* ------------------------------------------------------------------
  TYPES
------------------------------------------------------------------ */
type RoleSlug = "oic";

type CurrentUser = { name: string; role: RoleSlug };

type PendingStatus = "Unpaid" | "Overdue";

type PaymentLocation = "Central" | "City Hall";

type PendingRow = {
  id: string;
  violationNo: string;
  cin: string;
  plateNo: string;
  /** fine + impound fee (kapag Impounded na) */
  amount: number;
  fineAmount: number;
  impoundFee: number;
  recordedAt: Timestamp | null;
  dueDate: Timestamp | null;
  daysLeft: number;
  status: PendingStatus;
  impoundStatus: string | null;
  impoundAutoFlagged: boolean;
  impoundFlaggedBy: string | null;
  /** "clamped" | "impounded" — direct tows are never flagged. */
  enforcementType: string;
  /** For the impoundRecords entry */
  impoundSource: ImpoundRecordSource;
  // ⚠️ ADDED: violator identity fields
  violatorUid: string | null;
  guestId: string | null;
  violatorName: string | null;
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

const PAYMENT_LOCATIONS: { value: PaymentLocation; label: string }[] = [
  { value: "Central", label: "Central (MTPB Office)" },
  { value: "City Hall", label: "City Hall" },
];

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
  OIC SIDEBAR — paths match App.tsx routes (/dashboard/*)
------------------------------------------------------------------ */
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Dashboard",
    items: [
      { label: "Overview", icon: overviewIcon, path: "/dashboard" },
      { label: "Sector Analytics", icon: sectorAnalyticsIcon, path: "/dashboard/sector-analytics" },
      { label: "Geospatial Heatmap", icon: mapIcon, path: "/dashboard/heatmap" },
    ],
  },
  {
    label: "Enforcement",
    items: [
      { label: "Clamping Log", icon: clampingIcon, path: "/dashboard/clamping" },
      { label: "Impounding Log", icon: impoundingIcon, path: "/dashboard/impounding" },
      { label: "Vehicle History", icon: historyIcon, path: "/dashboard/vehicle-history" },
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
      { label: "Release Requests", icon: releaseRequestIcon, path: "/dashboard/release-requests" },
      { label: "Release Queue", icon: queueIcon, path: "/dashboard/release-queue" },
      { label: "Release Log", icon: releaseLogIcon, path: "/dashboard/release-log" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Active Clamping Teams", icon: clampingTeamsIcon, path: "/dashboard/clamping-teams" },
      { label: "Active Impounding", icon: towTruckIcon, path: "/dashboard/active-impounding" },
      { label: "Field Updates", icon: fieldUpdateIcon, path: "/dashboard/field-updates" },
      { label: "Operation Scheduler", icon: operationSchedulerIcon, path: "/dashboard/operation-scheduler" },
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

/**
 * Ilang araw pa bago ang due date. Negative kapag lumampas na — kahit
 * ilang oras pa lang. (Dati Math.ceil lang, kaya ang -0.2 araw ay naging
 * "0 days / Due Today" kahit overdue na at naka-auto-flag na.)
 */
const computeDaysLeft = (ts: Timestamp | null): number => {
  if (!ts) return 0;
  try {
    const diffDays = (ts.toDate().getTime() - new Date().getTime()) / 86400000;
    return diffDays < 0 ? Math.floor(diffDays) : Math.ceil(diffDays);
  } catch {
    return 0;
  }
};

/** True kapag ngayong araw ang due date at hindi pa lumalampas. */
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

/** "Overdue", "5 hrs" kapag wala nang isang araw, o "2 days". */
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
  COMPONENT: PendingPaymentsOIC
------------------------------------------------------------------ */
export default function PendingPaymentsOIC() {
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

  /* Search + Filter state */
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [sortOption, setSortOption] = useState<SortOption>("oldest");

  /* Cash payment modal state */
  const [cashRow, setCashRow] = useState<PendingRow | null>(null);
  const [cashError, setCashError] = useState("");
  const [paymentLocation, setPaymentLocation] = useState<PaymentLocation>("Central");
  const [saving, setSaving] = useState(false);
  const [savedReference, setSavedReference] = useState<string | null>(null);
  const [savedOrNumber, setSavedOrNumber] = useState<string | null>(null);
  const [savedPaymentId, setSavedPaymentId] = useState<string | null>(null);
  const [showPrintSlip, setShowPrintSlip] = useState(false);
  const [payMethod, setPayMethod] = useState<OnsiteMethod>("Cash");
  const [gcashRef, setGcashRef] = useState("");

  /* Subject-to-Impound modal state */
  const [impoundRow, setImpoundRow] = useState<PendingRow | null>(null);
  const [impoundNotes, setImpoundNotes] = useState("");
  const [impoundSaving, setImpoundSaving] = useState(false);
  const impoundRecordIds = useImpoundRecordIds();
  const autoFlagRunning = useRef(false);
  const autoFlagHandled = useRef<Set<string>>(new Set());

  /* Effect: Fetch current user profile */
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
            role: "oic",
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
              fineAmount: Number(data.fineAmount ?? 0),
              impoundFee: impoundFeeDue(data.impoundStatus, data.impoundFee),
              amount:
                Number(data.fineAmount ?? 0) +
                impoundFeeDue(data.impoundStatus, data.impoundFee),
              recordedAt,
              dueDate,
              daysLeft,
              status: (daysLeft < 0 ? "Overdue" : "Unpaid") as PendingStatus,
              impoundStatus: data.impoundStatus ?? null,
              impoundAutoFlagged: data.impoundAutoFlagged ?? false,
              impoundFlaggedBy: data.impoundFlaggedBy ?? null,
              enforcementType: String(data.enforcementType ?? "clamped").toLowerCase(),
              impoundSource: {
                id: d.id,
                reference:
                  (data.referenceNumber as string) ??
                  (data.paymentReference as string) ??
                  null,
                cin,
                plateNo: data.plateNo ?? "—",
                location: data.location ?? "—",
                violation: data.violationType ?? "—",
                officer: data.officer ?? "—",
                recordedAt,
              },
              // ⚠️ ADDED: violator identity (with null-safe fallbacks)
              violatorUid: data.violatorUid ?? null,
              guestId: data.guestId ?? null,
              violatorName: data.violatorName ?? null,
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

  /* AUTO-FLAG OVERDUE VIOLATIONS
     Clamped and unpaid past the 24-hour window → "Subject to Impound",
     plus an impoundRecords entry so the vehicle reaches Active Impounding
     and the Impounding Log. Also adds the record for violations flagged
     before that was done. Direct tows (enforcementType "impounded") are
     already impounded, so they are skipped. */
  useEffect(() => {
    if (loading || rows.length === 0) return;
    if (impoundRecordIds === null) return;
    if (autoFlagRunning.current) return;

    const handled = autoFlagHandled.current;
    const isActiveClamp = (row: PendingRow) =>
      row.enforcementType !== "impounded" &&
      row.impoundStatus !== "Impounded" &&
      !handled.has(row.id);

    const overdueRows = rows.filter(
      (row) =>
        isActiveClamp(row) &&
        row.daysLeft < 0 &&
        row.impoundStatus !== "Subject to Impound"
    );
    const missingRecordRows = rows.filter(
      (row) =>
        isActiveClamp(row) &&
        row.impoundStatus === "Subject to Impound" &&
        !impoundRecordIds.has(row.id)
    );

    if (overdueRows.length === 0 && missingRecordRows.length === 0) return;

    const work = [
      ...overdueRows.map((row) => ({ row, flag: true })),
      ...missingRecordRows.map((row) => ({ row, flag: false })),
    ];

    const autoFlagOverdue = async () => {
      autoFlagRunning.current = true;
      // A batch holds up to 500 writes; each row uses at most 3.
      const CHUNK = 150;
      try {
        for (let i = 0; i < work.length; i += CHUNK) {
          const chunk = work.slice(i, i + CHUNK);
          const batch = writeBatch(db);

          chunk.forEach(({ row, flag }) => {
            if (flag) {
              batch.update(doc(db, "violations", row.id), {
                impoundStatus: "Subject to Impound",
                impoundFlaggedAt: serverTimestamp(),
                impoundFlaggedBy: "system",
                impoundFlaggedByRole: "system",
                impoundAutoFlagged: true,
                impoundFee: IMPOUND_FEE,
                updatedAt: serverTimestamp(),
                updatedBy: "system",
              });

              batch.set(doc(collection(db, "auditLogs")), {
                userName: "System",
                userRole: "system",
                action: `auto-flagged violation ${row.cin} as Subject to Impound (24hr grace period expired)`,
                record: row.cin,
                type: "impound-flag-auto",
                metadata: {
                  cin: row.cin,
                  plateNo: row.plateNo,
                  daysOverdue: Math.abs(row.daysLeft),
                  impoundFee: IMPOUND_FEE,
                  method: "client-side",
                },
                timestamp: serverTimestamp(),
              });
            }

            if (!impoundRecordIds.has(row.id)) {
              setImpoundRecord(batch, row.impoundSource, {
                autoFlagged: flag || row.impoundAutoFlagged,
                createdBy: "system",
              });
            }
          });

          await batch.commit();
          chunk.forEach(({ row }) => handled.add(row.id));
        }
      } catch (err) {
        console.error("[auto-flag] Failed to flag overdue violations:", err);
      } finally {
        autoFlagRunning.current = false;
      }
    };

    autoFlagOverdue();
  }, [loading, rows, impoundRecordIds]);

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

  /* CASH PAYMENT MODAL HANDLERS */
  const openCashModal = (row: PendingRow) => {
    setCashRow(row);
    setCashError("");
    setPayMethod("Cash");
    setGcashRef("");
    setPaymentLocation("Central");
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

    if (payMethod === "GCash" && !isValidGcashReference(gcashRef)) {
      setCashError("Enter the 13-digit reference no. from the payer's GCash receipt.");
      return;
    }

    setSaving(true);
    try {
      if (payMethod === "GCash" && (await isGcashReferenceUsed(gcashRef))) {
        setCashError("This GCash reference no. was already used for another payment.");
        return;
      }

      const result = await recordOnsitePayment({
        violationId: cashRow.id,
        cin: cashRow.cin,
        plateNo: cashRow.plateNo,
        fineAmount: cashRow.fineAmount,
        impoundFee: cashRow.impoundFee,
        amountInWords: numberToWords(cashRow.amount),
        method: payMethod,
        gcashReference: gcashRef,
        counterLocation: paymentLocation,
        recordedByRole: "oic",
        officerName: currentUser.name,
        violatorUid: cashRow.violatorUid || null,
        guestId: cashRow.guestId || null,
        violatorName: cashRow.violatorName || null,
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

  /* SUBJECT-TO-IMPOUND MODAL HANDLERS */
  const openImpoundModal = (row: PendingRow) => {
    setImpoundRow(row);
    setImpoundNotes("");
  };

  const closeImpoundModal = () => {
    setImpoundRow(null);
    setImpoundNotes("");
  };

  const handleMarkSubjectToImpound = async () => {
    if (!impoundRow) return;

    setImpoundSaving(true);
    try {
      const violationRef = doc(db, "violations", impoundRow.id);
      const auditRef = doc(collection(db, "auditLogs"));

      const needsRecord = !impoundRecordIds?.has(impoundRow.id);

      await runTransaction(db, async (tx) => {
        if (needsRecord) {
          setImpoundRecordInTransaction(tx, impoundRow.impoundSource, {
            autoFlagged: false,
            createdBy: currentUser.name,
          });
        }

        tx.update(violationRef, {
          impoundStatus: "Subject to Impound",
          impoundFlaggedAt: serverTimestamp(),
          impoundFlaggedBy: currentUser.name,
          impoundFlaggedByRole: "oic",
          impoundFee: IMPOUND_FEE,
          impoundNotes: impoundNotes.trim() || null,
          updatedAt: serverTimestamp(),
          updatedBy: currentUser.name,
        });

        tx.set(auditRef, {
          userName: currentUser.name,
          userRole: "oic",
          action: `marked violation ${impoundRow.cin} as Subject to Impound (24hr grace period expired)`,
          record: impoundRow.cin,
          type: "impound-flag",
          metadata: {
            cin: impoundRow.cin,
            plateNo: impoundRow.plateNo,
            daysOverdue: Math.abs(impoundRow.daysLeft),
            impoundFee: IMPOUND_FEE,
            notes: impoundNotes.trim() || null,
          },
          timestamp: serverTimestamp(),
        });
      });

      alert(`✅ ${impoundRow.violationNo} marked as Subject to Impound.`);
      closeImpoundModal();
    } catch (err: any) {
      console.error("Failed to mark:", err);
      alert(err.message || "Failed to mark violation.");
    } finally {
      setImpoundSaving(false);
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
    const dueToday = rows.filter((r) => r.daysLeft >= 0 && isDueToday(r.dueDate)).length;
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
    <div className="oic-page pending-payments-page">
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
                    <p className="dropdown-role">Officer in Charge</p>
                  </div>
                  <button className="dropdown-item">
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

              {!loading && rows.length > 0 && (
                <p className="toolbar-result-count">
                  Showing <strong>{filteredRows.length}</strong> of{" "}
                  <strong>{rows.length}</strong> pending payment
                  {rows.length === 1 ? "" : "s"}
                  {searchQuery || statusFilter !== "All" ? " (filtered)" : ""}
                </p>
              )}

              {loading ? (
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
                            <td className="cell-amount">
                              {formatCurrency(row.amount)}
                              {row.impoundFee > 0 && (
                                <small className="amount-note">incl. impound fee</small>
                              )}
                            </td>
                            <td className="cell-due-date">{formatDate(row.dueDate)}</td>
                            <td className={`cell-days-left ${row.daysLeft < 0 ? "text-red" : ""}`}>
                              {formatTimeLeft(row.dueDate, row.daysLeft)}
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

                              {row.status === "Overdue" &&
                                row.enforcementType !== "impounded" &&
                                row.impoundStatus !== "Subject to Impound" &&
                                row.impoundStatus !== "Impounded" && (
                                  <button
                                    type="button"
                                    className="btn-subject-impound"
                                    onClick={() => openImpoundModal(row)}
                                  >
                                    Subject to Impound
                                  </button>
                                )}

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
                    {payMethod} payment recorded by <strong>{currentUser.name}</strong> (OIC) —{" "}
                    <strong>{payMethod === "GCash" ? "Online (GCash)" : paymentLocation}</strong>. {cashRow.cin} now appears under
                    Payment Verification.
                  </p>
                  <p className="cash-saved-hint">
                    Next step: Print the acknowledgment slip for the violator.
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
                    {/* ⚠️ ADDED: show violator name if available */}
                    {cashRow.violatorName && (
                      <div className="cash-summary-row">
                        <span>Violator</span>
                        <strong>{cashRow.violatorName}</strong>
                      </div>
                    )}
                    {cashRow.impoundFee > 0 && (
                      <>
                        <div className="cash-summary-row">
                          <span>Fine</span>
                          <strong>{formatCurrency(cashRow.fineAmount)}</strong>
                        </div>
                        <div className="cash-summary-row">
                          <span>Impound Fee</span>
                          <strong>{formatCurrency(cashRow.impoundFee)}</strong>
                        </div>
                      </>
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
                    {payMethod === "Cash" && (
                      <div className="cash-summary-row">
                        <span>Cash Received</span>
                        <strong className="cash-summary-amount">
                          {formatCurrency(cashRow.amount)}
                        </strong>
                      </div>
                    )}
                  </div>

                  {/* PAYMENT METHOD — Cash, or GCash paid to the MTPB QR */}
                  <div className="form-group">
                    <label>Payment Method</label>
                    <div className="pay-method-toggle" role="radiogroup">
                      {(["Cash", "GCash"] as OnsiteMethod[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          role="radio"
                          aria-checked={payMethod === m}
                          className={`pay-method-option ${payMethod === m ? "is-active" : ""}`}
                          onClick={() => {
                            setPayMethod(m);
                            setCashError("");
                          }}
                          disabled={saving}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  {payMethod === "GCash" && (
                    <div className="form-group">
                      <label htmlFor="gcashRef">
                        GCash Reference No. <span className="required">*</span>
                      </label>
                      <input
                        id="gcashRef"
                        className="form-input"
                        inputMode="numeric"
                        placeholder="13-digit reference no."
                        value={gcashRef}
                        onChange={(e) => setGcashRef(e.target.value.replace(/[^\d\s]/g, "").slice(0, 16))}
                        disabled={saving}
                      />
                      <small className="form-hint">
                        From the payer's GCash receipt after paying to the MTPB GCash QR.
                        Recorded as an Online (GCash) payment.
                      </small>
                    </div>
                  )}

                  {/* PAYMENT LOCATION — cash only; GCash is "Online" */}
                  {payMethod === "Cash" && (
                  <div className="form-group">
                    <label htmlFor="paymentLocation">
                      Payment Location <span className="required">*</span>
                    </label>
                    <select
                      id="paymentLocation"
                      className="form-input"
                      value={paymentLocation}
                      onChange={(e) => setPaymentLocation(e.target.value as PaymentLocation)}
                      disabled={saving}
                    >
                      {PAYMENT_LOCATIONS.map((loc) => (
                        <option key={loc.value} value={loc.value}>
                          {loc.label}
                        </option>
                      ))}
                    </select>
                    <small className="form-hint">
                      Select where the violator paid — Central (MTPB Office) or City Hall.
                    </small>
                  </div>
                  )}

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
                    Recorded by <strong>{currentUser.name}</strong> (OIC). The violation
                    moves to Payment Verification.
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
                  <button className="btn-primary" onClick={handleSaveCash} disabled={saving}>
                    {saving ? "Saving..." : "Confirm Payment"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUBJECT TO IMPOUND MODAL */}
      {impoundRow && (
        <div
          className="modal-overlay"
          onClick={impoundSaving ? undefined : closeImpoundModal}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Mark Subject to Impound</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={closeImpoundModal}
                disabled={impoundSaving}
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="impound-warning">
                <p>
                  ⚠️ This violation has exceeded the <strong>24-hour grace period</strong>{" "}
                  and remains unpaid.
                </p>
                <p>
                  Once marked, the vehicle becomes <strong>subject to impound</strong> by
                  the Impounding Staff.
                </p>
              </div>

              <div className="cash-summary">
                <div className="cash-summary-row">
                  <span>CIN</span>
                  <strong>{impoundRow.cin}</strong>
                </div>
                <div className="cash-summary-row">
                  <span>Plate No.</span>
                  <strong>{impoundRow.plateNo}</strong>
                </div>
                <div className="cash-summary-row">
                  <span>Days Overdue</span>
                  <strong className="text-red">{Math.abs(impoundRow.daysLeft)} day(s)</strong>
                </div>
                <div className="cash-summary-row">
                  <span>Original Fine</span>
                  <strong>{formatCurrency(impoundRow.amount)}</strong>
                </div>
                <div className="cash-summary-row">
                  <span>Impound Fee</span>
                  <strong className="cash-summary-amount">{formatCurrency(IMPOUND_FEE)}</strong>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="impoundNotes">Notes (Optional)</label>
                <textarea
                  id="impoundNotes"
                  className="form-input"
                  rows={3}
                  placeholder="e.g. Vehicle location, additional remarks..."
                  value={impoundNotes}
                  onChange={(e) => setImpoundNotes(e.target.value)}
                  disabled={impoundSaving}
                />
              </div>

              <p className="modal-note">
                Marked by <strong>{currentUser.name}</strong> (OIC). This action will be
                logged in the audit trail.
              </p>
            </div>

            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={closeImpoundModal}
                disabled={impoundSaving}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={handleMarkSubjectToImpound}
                disabled={impoundSaving}
              >
                {impoundSaving ? "Marking..." : "Confirm Subject to Impound"}
              </button>
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
          amount={cashRow.fineAmount}
          impoundFee={cashRow.impoundFee}
          totalAmount={cashRow.amount}
          method={payMethod}
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