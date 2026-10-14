import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  KeyRound,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  X,
  Building2,
  Landmark,
  Smartphone,
} from "lucide-react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import {
  PAYMENT_LOCATION_LABELS,
  PAYMENT_LOCATION_OPTIONS,
  derivePaymentLocation,
  type PaymentLocation,
} from "../../lib/paymentLocation";
import "./PaymentVerification.css";

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

type WaitingBand = "Over 24 hrs" | "6-24 hrs" | "Under 6 hrs";
type PaymentMethod = "GCash" | "Cash";
type PaymentStatus = "Pending Verification" | "Verified" | "Rejected";

type PaymentRow = {
  id: string;
  reference: string;
  orNumber: string | null;
  cin: string | null;
  plateNo: string | null;
  amount: number;
  method: PaymentMethod;
  paymentLocation: PaymentLocation;
  waiting: WaitingBand;
  status: PaymentStatus;
  verifiedAt: Timestamp | null;
  paidAt: Timestamp | null;
  violationId: string | null;
  clampId: string | null;
  recordedBy: string | null;
  orphaned: boolean;
  amountInWords: string | null;
  cashReceived: number | null;
  createdAt: Timestamp | null;
  violatorUid: string | null;
  guestId: string | null;
  violatorName: string | null;
};

type Metrics = {
  pendingReview: number;
  approvedToday: number;
  rejectedToday: number;
  cityHallCount: number;
  centralCount: number;
  onlineCount: number;
};

type NavItem = { label: string; icon: string; path: string; active?: boolean };
type NavGroup = { label: string; items: NavItem[] };

/* ------------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------------ */
const ITEMS_PER_PAGE = 10;

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

const LOCATION_OPTIONS: Array<PaymentLocation | "All Locations"> = [
  "All Locations",
  ...PAYMENT_LOCATION_OPTIONS,
];

const LOCATION_LABELS = PAYMENT_LOCATION_LABELS;

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
      { label: "Pending Payments", icon: pendingPaymentsIcon, path: "/dashboard/pending-payments" },
      {
        label: "Payment Verification",
        icon: paymentVerificationIcon,
        path: "/dashboard/verification",
        active: true,
      },
      { label: "Transaction History", icon: transactionIcon, path: "/dashboard/transactions" },
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

const isToday = (ts: Timestamp | null): boolean => {
  if (!ts) return false;
  try {
    return ts.toDate().toDateString() === new Date().toDateString();
  } catch {
    return false;
  }
};

const millis = (ts: Timestamp | null): number => {
  try {
    return ts ? ts.toMillis() : 0;
  } catch {
    return 0;
  }
};

const computeWaitingBand = (paidAt: Timestamp | null): WaitingBand => {
  if (!paidAt) return "Over 24 hrs";
  try {
    const hours = (new Date().getTime() - paidAt.toDate().getTime()) / 3600000;
    if (hours < 6) return "Under 6 hrs";
    if (hours < 24) return "6-24 hrs";
    return "Over 24 hrs";
  } catch {
    return "Over 24 hrs";
  }
};

const getWaitingClass = (band: WaitingBand): string => {
  const map: Record<WaitingBand, string> = {
    "Under 6 hrs": "waiting-fresh",
    "6-24 hrs": "waiting-mid",
    "Over 24 hrs": "waiting-long",
  };
  return map[band] ?? "";
};

/** GCash → "Online"; cash → City Hall / Central (tingnan ang lib/paymentLocation) */
const deriveLocation = (data: any): PaymentLocation =>
  derivePaymentLocation(data.method, data.paymentLocation ?? data.location);

const getLocationClass = (location: PaymentLocation): string => {
  const map: Record<PaymentLocation, string> = {
    "City Hall": "location-city-hall",
    Central: "location-central",
    Online: "location-online",
  };
  return map[location] ?? "";
};

const hasNoViolator = (r: {
  violatorUid: string | null;
  guestId: string | null;
  violatorName: string | null;
}) => !r.violatorUid && !r.guestId && !r.violatorName;

/** "Juan Cruz (Registered)", "Guest — guest_NMK 8908", o "—". */
const violatorLabel = (row: PaymentRow): string => {
  if (row.violatorName) {
    return row.violatorUid
      ? `${row.violatorName} (Registered)`
      : row.guestId
      ? `${row.violatorName} (Guest)`
      : row.violatorName;
  }
  if (row.violatorUid) return `Registered — ${row.violatorUid}`;
  if (row.guestId) return `Guest — ${row.guestId}`;
  return "—";
};

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function PaymentVerification() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "oic",
  });

  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({
    pendingReview: 0,
    approvedToday: 0,
    rejectedToday: 0,
    cityHallCount: 0,
    centralCount: 0,
    onlineCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  /* Location filter */
  const [locationFilter, setLocationFilter] = useState<
    PaymentLocation | "All Locations"
  >("All Locations");

  /* SCAN BOX STATE */
  const [scanInput, setScanInput] = useState("");
  const [scanError, setScanError] = useState("");
  const [scannedPayment, setScannedPayment] = useState<PaymentRow | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);

  /* ⚠️ CHANGED: Hoisted role check — used in multiple places */
  const isOIC = currentUser.role === "oic";

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

  /* Auto-focus scan input on mount */
  useEffect(() => {
    scanInputRef.current?.focus();
  }, []);

  /* Payments listener */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "payments"),
      async (snap) => {
        const base = snap.docs.map((d) => {
          const data = d.data();

          const rawMethod = String(data.method ?? "cash").toLowerCase();
          const method: PaymentMethod =
            rawMethod === "gcash" ? "GCash" : "Cash";

          const rawStatus = String(
            data.verificationStatus ?? data.status ?? ""
          ).toLowerCase();

          const status: PaymentStatus = [
            "verified",
            "succeeded",
            "approved",
          ].includes(rawStatus)
            ? "Verified"
            : ["rejected", "failed", "declined"].includes(rawStatus)
            ? "Rejected"
            : "Pending Verification";

          const paidAt =
            (data.paidAt as Timestamp) ??
            (data.createdAt as Timestamp) ??
            null;

          return {
            id: d.id,
            reference: data.referenceNumber ?? data.paymentReference ?? d.id,
            orNumber: (data.orNumber as string) ?? null,
            cin: ((data.cin ?? data.violationCin) as string) ?? null,
            plateNo: ((data.plateNo ?? data.plateNumber) as string) ?? null,
            amount: Number(data.totalAmount ?? data.amount ?? 0),
            method,
            paymentLocation: deriveLocation(data),
            waiting: computeWaitingBand(paidAt),
            status,
            verifiedAt: (data.verifiedAt as Timestamp) ?? null,
            paidAt,
            violationId: (data.violationId as string) ?? null,
            clampId: (data.clampId as string) ?? null,
            recordedBy: (data.recordedBy as string) ?? null,
            orphaned: false,
            amountInWords: (data.amountInWords as string) ?? null,
            cashReceived: (data.cashReceived as number) ?? null,
            createdAt: (data.createdAt as Timestamp) ?? null,
            violatorUid: (data.violatorUid as string) ?? null,
            guestId: (data.guestId as string) ?? null,
            violatorName: (data.violatorName as string) ?? null,
          } as PaymentRow;
        });

        const needsLookup = base.filter(
          (r) => r.violationId && (!r.cin || !r.plateNo || hasNoViolator(r))
        );
        const uniqueIds = Array.from(
          new Set(needsLookup.map((r) => r.violationId as string))
        );

        const violationCache = new Map<
          string,
          {
            cin: string | null;
            plateNo: string | null;
            clampId: string | null;
            violatorUid: string | null;
            guestId: string | null;
            violatorName: string | null;
          }
        >();

        await Promise.all(
          uniqueIds.map(async (vId) => {
            try {
              const vSnap = await getDoc(doc(db, "violations", vId));
              if (vSnap.exists()) {
                const v = vSnap.data();
                violationCache.set(vId, {
                  cin: v.cin ?? null,
                  plateNo: v.plateNo ?? null,
                  clampId: v.clampId ?? null,
                  violatorUid: (v.violatorUid as string) ?? null,
                  guestId: (v.guestId as string) ?? null,
                  violatorName: (v.violatorName as string) ?? null,
                });
              }
            } catch (err) {
              console.warn(`Violation ${vId} lookup failed:`, err);
            }
          })
        );

        const enriched = base.map((r) => {
          const linked = r.violationId
            ? violationCache.get(r.violationId)
            : undefined;

          const cin = r.cin ?? linked?.cin ?? null;
          const plateNo = r.plateNo ?? linked?.plateNo ?? null;
          const clampId = r.clampId ?? linked?.clampId ?? null;

          const orphaned = !r.violationId && !cin;

          return {
            ...r,
            cin,
            plateNo,
            clampId,
            orphaned,
            violatorUid: r.violatorUid ?? linked?.violatorUid ?? null,
            guestId: r.guestId ?? linked?.guestId ?? null,
            violatorName: r.violatorName ?? linked?.violatorName ?? null,
          };
        });

        const pendingRows = enriched
          .filter((p) => p.status === "Pending Verification")
          .sort((a, b) => millis(a.paidAt) - millis(b.paidAt));

        setRows(pendingRows);
        setMetrics({
          pendingReview: pendingRows.length,
          approvedToday: enriched.filter(
            (p) => p.status === "Verified" && isToday(p.verifiedAt)
          ).length,
          rejectedToday: enriched.filter(
            (p) => p.status === "Rejected" && isToday(p.verifiedAt)
          ).length,
          // PENDING lang (dati, kasama pati verified at rejected)
          cityHallCount: pendingRows.filter(
            (p) => p.paymentLocation === "City Hall"
          ).length,
          centralCount: pendingRows.filter(
            (p) => p.paymentLocation === "Central"
          ).length,
          onlineCount: pendingRows.filter(
            (p) => p.paymentLocation === "Online"
          ).length,
        });
        setLoading(false);
      },
      (err) => {
        console.warn("Payments fetch failed:", err.code);
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

  /* SCAN HANDLER */
  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setScanError("");
    setScannedPayment(null);

    const text = scanInput.trim();
    if (!text) return;

    setScanLoading(true);

    try {
      let paymentId: string | null = null;
      let paymentDoc: any = null;

      const urlMatch = text.match(/\/r\/([A-Za-z0-9_-]+)/);
      if (urlMatch) {
        paymentId = urlMatch[1];
        const snap = await getDoc(doc(db, "payments", paymentId));
        if (snap.exists()) {
          paymentDoc = { id: snap.id, ...snap.data() };
        }
      } else if (/^REF-\d{4}-\d{5}$/.test(text)) {
        const q = query(
          collection(db, "payments"),
          where("referenceNumber", "==", text)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          paymentDoc = { id: snap.docs[0].id, ...snap.docs[0].data() };
        }
      } else {
        setScanError("Not a payment code.");
        setScanInput("");
        setScanLoading(false);
        scanInputRef.current?.focus();
        return;
      }

      if (!paymentDoc) {
        setScanError("No payment found for this code.");
        setScanInput("");
        setScanLoading(false);
        scanInputRef.current?.focus();
        return;
      }

      const method = String(paymentDoc.method ?? "").toLowerCase();
      if (method !== "cash") {
        setScanError("This is a GCash payment — verify it from the Verification Queue below.");
        setScanInput("");
        setScanLoading(false);
        scanInputRef.current?.focus();
        return;
      }

      const status = String(
        paymentDoc.verificationStatus ?? paymentDoc.status ?? ""
      ).toLowerCase();

      if (["verified", "succeeded", "approved"].includes(status)) {
        const verifiedAt = paymentDoc.verifiedAt?.toDate?.();
        const verifiedBy = paymentDoc.verifiedBy ?? "unknown";
        setScanError(
          `Already verified${verifiedAt ? ` on ${verifiedAt.toLocaleString()}` : ""} by ${verifiedBy}.`
        );
        setScanInput("");
        setScanLoading(false);
        scanInputRef.current?.focus();
        return;
      }

      if (["rejected", "failed", "declined"].includes(status)) {
        const rejectedAt = paymentDoc.verifiedAt?.toDate?.();
        const rejectedBy = paymentDoc.verifiedBy ?? "unknown";
        setScanError(
          `Already rejected${rejectedAt ? ` on ${rejectedAt.toLocaleString()}` : ""} by ${rejectedBy}.`
        );
        setScanInput("");
        setScanLoading(false);
        scanInputRef.current?.focus();
        return;
      }

      const paidAt =
        (paymentDoc.paidAt as Timestamp) ??
        (paymentDoc.createdAt as Timestamp) ??
        null;

      const row: PaymentRow = {
        id: paymentDoc.id,
        reference: paymentDoc.referenceNumber ?? paymentDoc.paymentReference ?? paymentDoc.id,
        orNumber: paymentDoc.orNumber ?? null,
        cin: paymentDoc.cin ?? null,
        plateNo: paymentDoc.plateNo ?? null,
        amount: Number(paymentDoc.totalAmount ?? paymentDoc.amount ?? 0),
        method: "Cash",
        paymentLocation: deriveLocation(paymentDoc),
        waiting: computeWaitingBand(paidAt),
        status: "Pending Verification",
        verifiedAt: null,
        paidAt,
        violationId: paymentDoc.violationId ?? null,
        clampId: paymentDoc.clampId ?? null,
        recordedBy: paymentDoc.recordedBy ?? null,
        orphaned: false,
        amountInWords: paymentDoc.amountInWords ?? null,
        cashReceived: paymentDoc.cashReceived ?? null,
        createdAt: (paymentDoc.createdAt as Timestamp) ?? null,
        violatorUid: paymentDoc.violatorUid ?? null,
        guestId: paymentDoc.guestId ?? null,
        violatorName: paymentDoc.violatorName ?? null,
      };

      setScannedPayment(row);
      setScanInput("");
      setScanLoading(false);
    } catch (err: any) {
      console.error("Scan lookup failed:", err);
      setScanError(err.message || "Failed to look up payment.");
      setScanInput("");
      setScanLoading(false);
      scanInputRef.current?.focus();
    }
  };

  const clearScan = () => {
    setScanInput("");
    setScanError("");
    setScannedPayment(null);
    scanInputRef.current?.focus();
  };

  /* PAYMENT ACTION HANDLER */
  const findClampRef = async (clampId: string | null) => {
    if (!clampId) return null;
    try {
      const snap = await getDocs(
        query(collection(db, "clamps"), where("clampId", "==", clampId))
      );
      return snap.empty ? null : snap.docs[0].ref;
    } catch (err) {
      console.warn("Clamp lookup failed:", err);
      return null;
    }
  };

  const findViolationRef = async (row: PaymentRow) => {
    if (row.violationId) return doc(db, "violations", row.violationId);
    if (!row.cin) return null;
    try {
      const snap = await getDocs(
        query(collection(db, "violations"), where("cin", "==", row.cin))
      );
      return snap.empty ? null : snap.docs[0].ref;
    } catch (err) {
      console.warn("Violation lookup failed:", err);
      return null;
    }
  };

  const handlePaymentAction = async (
    row: PaymentRow,
    action: "Verified" | "Rejected"
  ) => {
    if (row.orphaned) {
      alert(
        "This payment is not linked to any violation. It cannot be approved or rejected here — check the payment record in Firestore first."
      );
      return;
    }

    /* Payment verification: OIC at Finance lang. Ang Supervisor ay para
       sa pag-approve ng RELEASE, hindi ng payment. */
    if (currentUser.role !== "oic" && currentUser.role !== "finance") {
      alert(
        "❌ PERMISSION DENIED\n\n" +
          "Only the OIC or Finance Staff can verify payments.\n\n" +
          `Your role: ${ROLE_LABELS[currentUser.role]}`
      );
      return;
    }

    /* ⚠️ CHANGED: SEGREGATION OF DUTIES CHECK — now role-aware
       - OIC: Always allowed to verify (final approver, highest authority)
       - Finance: Cannot self-verify on Central payments (two-person control)
       - City Hall: Self-verification allowed for all roles (with audit log) */
    const isSelfVerification = row.recordedBy === currentUser.name;
    const isCityHallPayment = row.paymentLocation === "City Hall";

    // Only block if NOT OIC and NOT City Hall — Finance/Supervisor on Central
    if (
      action === "Verified" &&
      isSelfVerification &&
      !isOIC &&
      !isCityHallPayment
    ) {
      alert(
        "SEGREGATION OF DUTIES VIOLATION\n\n" +
          "You cannot verify your own cash entry.\n\n" +
          `You recorded this payment (${row.reference}). ` +
          "A DIFFERENT authorized personnel (another Finance Staff or the OIC) " +
          "must verify this payment.\n\n" +
          "This is required by COA Circular 2022-004 (Government Cash Handling — Two-Person Control)."
      );

      try {
        await addDoc(collection(db, "auditLogs"), {
          userName: currentUser.name,
          action: `attempted to self-verify payment ${row.reference} for ${row.cin}`,
          record: row.cin ?? row.reference,
          type: "segregation-violation-attempt",
          metadata: {
            reference: row.reference,
            cin: row.cin,
            recordedBy: row.recordedBy,
            attemptedBy: currentUser.name,
            paymentLocation: row.paymentLocation,
          },
          timestamp: serverTimestamp(),
        });
      } catch (logErr) {
        console.warn("Failed to log segregation violation attempt:", logErr);
      }

      return;
    }

    /* ⚠️ CHANGED: OIC self-verification — confirmation dialog (with audit trail)
       OIC is the final approver, so self-verification is allowed.
       But we still log it for accountability. */
    if (
      action === "Verified" &&
      isSelfVerification &&
      isOIC &&
      !isCityHallPayment
    ) {
      const proceed = window.confirm(
        "⚠️ OIC SELF-VERIFICATION\n\n" +
          `You recorded this payment (${row.reference}) yourself.\n\n` +
          "As OIC, you have the authority to verify this payment.\n" +
          "This action will be logged in the audit trail for accountability.\n\n" +
          "Confirm to proceed?"
      );

      if (!proceed) return;
    }

    /* City Hall self-verification — confirmation dialog (non-OIC only) */
    if (
      action === "Verified" &&
      isSelfVerification &&
      isCityHallPayment &&
      !isOIC
    ) {
      const proceed = window.confirm(
        "⚠️ CITY HALL SELF-VERIFICATION\n\n" +
          `You recorded this City Hall payment (${row.reference}) yourself.\n\n` +
          "Self-verification is allowed for City Hall transactions.\n" +
          "This action will be logged in the audit trail for accountability.\n\n" +
          "Confirm to proceed?"
      );

      if (!proceed) return;
    }

    let rejectionReason = "";
    if (action === "Rejected") {
      const input = window.prompt(
        `Reject payment ${row.reference}?\n\nViolator: ${violatorLabel(row)}\n\nEnter the reason — the violator will need this to understand why the payment was not accepted:`
      );
      if (input === null) return;
      if (!input.trim()) {
        alert("A rejection reason is required.");
        return;
      }
      rejectionReason = input.trim();
    } else if (!isSelfVerification || (!isCityHallPayment && !isOIC)) {
      /* ⚠️ CHANGED: Skip extra confirm dialog for OIC self-verify (already confirmed above) */
      if (
        !window.confirm(
          `Approve payment for ${row.reference}?\n\nCIN: ${
            row.cin ?? "—"
          }\nViolator: ${violatorLabel(row)}\nOR Number: ${row.orNumber ?? "—"}\nAmount: ${formatCurrency(
            row.amount
          )}\nMethod: ${row.method}\nLocation: ${LOCATION_LABELS[row.paymentLocation]}`
        )
      ) {
        return;
      }
    }

    setActioning(row.id);

    try {
      const violationRef = await findViolationRef(row);
      if (!violationRef) {
        alert(
          "The linked violation could not be found. Nothing was changed — please check the record before retrying."
        );
        setActioning(null);
        return;
      }

      let resolvedClampId: string | null = row.clampId;

      if (!resolvedClampId) {
        try {
          const vSnap = await getDoc(violationRef);
          if (vSnap.exists()) {
            const vData = vSnap.data();
            resolvedClampId = vData.clampId ?? vData.clampQrId ?? null;
          }
        } catch (err) {
          console.warn("Clamp resolution from violation failed:", err);
        }
      }

      const clampRef =
        action === "Verified" ? await findClampRef(resolvedClampId) : null;

      const batch = writeBatch(db);

      /* ⚠️ CHANGED: Self-verified flag covers both OIC and City Hall */
      const isSelfVerifiedAction =
        isSelfVerification && (isCityHallPayment || isOIC);

      // 1. Payment record
      batch.update(doc(db, "payments", row.id), {
        status: action,
        verificationStatus: action,
        verifiedBy: currentUser.name,
        verifiedAt: serverTimestamp(),
        violatorUid: row.violatorUid,
        guestId: row.guestId,
        violatorName: row.violatorName,
        ...(isSelfVerifiedAction
          ? { selfVerified: true, selfVerifiedByOIC: isOIC }
          : {}),
        ...(action === "Rejected" ? { rejectionReason } : {}),
      });

      // 2. Violation
      batch.update(violationRef, {
        paymentStatus: action === "Verified" ? "Verified" : "Rejected",
        verifiedBy: currentUser.name,
        verifiedAt: serverTimestamp(),
        ...(action === "Verified"
          ? {
              paymentMethod: row.method,
              paymentReference: row.reference,
              referenceNumber: row.reference,
              orNumber: row.orNumber,
              totalPaid: row.amount,
              paidAt: row.paidAt ?? serverTimestamp(),
              paymentLocation: row.paymentLocation,
              releaseStatus: "Awaiting OIC Approval",
            }
          : {}),
        ...(action === "Rejected"
          ? {
              rejectionReason,
              rejectedAt: serverTimestamp(),
              paymentMethod: null,
              paymentReference: null,
              referenceNumber: null,
              paidAt: null,
              totalPaid: null,
            }
          : {}),
      });

      // 3. Clamp
      if (clampRef) {
        batch.update(clampRef, {
          status: "verified",
          paidAt: serverTimestamp(),
        });
      }

      // 4. Audit log
      batch.set(doc(collection(db, "auditLogs")), {
        userName: currentUser.name,
        action: `${action === "Verified" ? "approved" : "rejected"} payment for ${
          row.cin ?? "(no CIN)"
        } (${row.reference}${row.orNumber ? ` — OR #${row.orNumber}` : ""})${
          isSelfVerification && isOIC
            ? " [OIC SELF-VERIFIED]"
            : isSelfVerification && isCityHallPayment
            ? " [CITY HALL SELF-VERIFIED]"
            : ""
        }`,
        record: row.cin ?? row.reference,
        type:
          isSelfVerification && isOIC
            ? "payment-verification-self-oic"
            : isSelfVerification && isCityHallPayment
            ? "payment-verification-self-city-hall"
            : "payment-verification",
        metadata: {
          reference: row.reference,
          orNumber: row.orNumber,
          cin: row.cin,
          amount: row.amount,
          method: row.method,
          paymentLocation: row.paymentLocation,
          newStatus: action,
          recordedBy: row.recordedBy,
          verifiedBy: currentUser.name,
          selfVerified: isSelfVerifiedAction,
          selfVerifiedByOIC: isOIC && isSelfVerification,
          ...(rejectionReason ? { rejectionReason } : {}),
        },
        timestamp: serverTimestamp(),
      });

      await batch.commit();

      if (scannedPayment?.id === row.id) {
        clearScan();
      }
    } catch (err: any) {
      console.error("Error updating payment:", err);
      alert(err.message || "Failed to update payment.");
    } finally {
      setActioning(null);
    }
  };

  /* Filtered rows by location */
  const filteredRows = useMemo(() => {
    if (locationFilter === "All Locations") return rows;
    return rows.filter((r) => r.paymentLocation === locationFilter);
  }, [rows, locationFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [locationFilter]);

  const metricCards = [
    { title: "Pending Review", value: String(metrics.pendingReview) },
    { title: "Approved Today", value: String(metrics.approvedToday) },
    { title: "Rejected Today", value: String(metrics.rejectedToday) },
    { title: "City Hall", value: String(metrics.cityHallCount) },
    { title: "Central (MTPB)", value: String(metrics.centralCount) },
    { title: "Online (GCash)", value: String(metrics.onlineCount) },
  ];

  /* Pagination */
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE)),
    [filteredRows.length]
  );
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = filteredRows.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  );

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  return (
    <div className="oic-page payment-verification-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <img src={logo} alt="MTPB logo" className="sidebar-logo-img" />
            <div>
              <p className="sidebar-brand-name">MTPB</p>
              <p className="sidebar-brand-role">{ROLE_LABELS[currentUser.role]}</p>
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
                        className={`nav-item ${item.active ? "nav-item-active" : ""}`}
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
              <h1>Payment Verification</h1>
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
                    <p className="dropdown-role">{ROLE_LABELS[currentUser.role]}</p>
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
            {/* SCAN BOX */}
            <div className="scan-box-card">
              <h2 className="scan-box-title">Scan payment slip</h2>
              <p className="scan-box-hint">
                Scan the QR on the slip, or type the REF number. The USB
                scanner types the code and presses Enter automatically.
              </p>
              <form onSubmit={handleScanSubmit}>
                <input
                  ref={scanInputRef}
                  type="text"
                  className="scan-box-input"
                  placeholder="Scan or type payment code"
                  value={scanInput}
                  onChange={(e) => {
                    setScanInput(e.target.value);
                    setScanError("");
                  }}
                  autoFocus
                  disabled={scanLoading}
                />
              </form>
              {scanError && <p className="scan-box-error">{scanError}</p>}

              {/* SCANNED PAYMENT DETAILS */}
              {scannedPayment && (
                <div className="scanned-payment-details">
                  <div className="scan-details-header">
                    <h3 className="scan-details-title">Payment found</h3>
                    <button
                      type="button"
                      className="scan-details-close"
                      onClick={clearScan}
                      title="Clear"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="scan-details-grid">
                    <div className="scan-row">
                      <span>Reference</span>
                      <strong>{scannedPayment.reference}</strong>
                    </div>
                    <div className="scan-row">
                      <span>OR Number</span>
                      <strong>{scannedPayment.orNumber ?? "—"}</strong>
                    </div>
                    <div className="scan-row">
                      <span>CIN</span>
                      <strong>{scannedPayment.cin ?? "—"}</strong>
                    </div>
                    <div className="scan-row">
                      <span>Plate No.</span>
                      <strong>{scannedPayment.plateNo ?? "—"}</strong>
                    </div>
                    <div className="scan-row">
                      <span>Violator</span>
                      <strong>{violatorLabel(scannedPayment)}</strong>
                    </div>
                    <div className="scan-row">
                      <span>Amount</span>
                      <strong>{formatCurrency(scannedPayment.amount)}</strong>
                    </div>
                    {scannedPayment.amountInWords && (
                      <div className="scan-row">
                        <span>Amount in Words</span>
                        <strong className="scan-row-words">
                          {scannedPayment.amountInWords}
                        </strong>
                      </div>
                    )}
                    {scannedPayment.cashReceived !== null && (
                      <div className="scan-row">
                        <span>Cash Received</span>
                        <strong>
                          {formatCurrency(scannedPayment.cashReceived)}
                        </strong>
                      </div>
                    )}
                    <div className="scan-row">
                      <span>Method</span>
                      <strong>{scannedPayment.method}</strong>
                    </div>
                    <div className="scan-row">
                      <span>Location</span>
                      <strong>
                        <span
                          className={`location-pill ${getLocationClass(
                            scannedPayment.paymentLocation
                          )}`}
                        >
                          {LOCATION_LABELS[scannedPayment.paymentLocation]}
                        </span>
                      </strong>
                    </div>
                    <div className="scan-row">
                      <span>Recorded by</span>
                      <strong>{scannedPayment.recordedBy ?? "—"}</strong>
                    </div>
                    <div className="scan-row">
                      <span>Time</span>
                      <strong>
                        {scannedPayment.paidAt
                          ? scannedPayment.paidAt.toDate().toLocaleString()
                          : "—"}
                      </strong>
                    </div>
                  </div>

                  {/* ⚠️ CHANGED: Self-verification notice — now covers OIC for all locations */}
                  {scannedPayment.recordedBy === currentUser.name &&
                    (scannedPayment.paymentLocation === "City Hall" ||
                      isOIC) && (
                      <div className="self-verify-notice">
                        ⚠️ You recorded this payment.{" "}
                        {isOIC
                          ? "As OIC, self-verification is allowed"
                          : "Self-verification is allowed for City Hall transactions"}{" "}
                        but will be logged for accountability.
                      </div>
                    )}

                  <div className="scan-actions">
                    <button
                      type="button"
                      className="btn-approve"
                      onClick={() =>
                        handlePaymentAction(scannedPayment, "Verified")
                      }
                      disabled={actioning === scannedPayment.id}
                    >
                      {actioning === scannedPayment.id ? "..." : "✅ Verify"}
                    </button>
                    <button
                      type="button"
                      className="btn-reject"
                      onClick={() =>
                        handlePaymentAction(scannedPayment, "Rejected")
                      }
                      disabled={actioning === scannedPayment.id}
                    >
                      {actioning === scannedPayment.id ? "..." : "❌ Reject"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* METRIC CARDS */}
            <div className="metric-grid-three">
              {metricCards.map((card) => (
                <div key={card.title} className="card metric-card">
                  <p className="metric-title">{card.title}</p>
                  <p className="metric-value">{card.value}</p>
                </div>
              ))}
            </div>

            {/* VERIFICATION QUEUE */}
            <div className="card">
              <div className="card-header-row">
                <div>
                  <p className="card-eyebrow">Sector 3 · Oldest first</p>
                  <h2 className="card-title">Verification Queue</h2>
                </div>

                <select
                  value={locationFilter}
                  onChange={(e) =>
                    setLocationFilter(
                      e.target.value as PaymentLocation | "All Locations"
                    )
                  }
                  className="location-filter-select"
                >
                  {LOCATION_OPTIONS.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc === "All Locations"
                        ? "All Locations"
                        : LOCATION_LABELS[loc as PaymentLocation]}
                    </option>
                  ))}
                </select>
              </div>

              {loading ? (
                <div className="table-loading">
                  <p>Loading verification queue...</p>
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="table-empty">
                  <p>
                    {rows.length === 0
                      ? "No payments pending review."
                      : "No payments match the selected location."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Reference</th>
                          <th>OR Number</th>
                          <th>CIN</th>
                          <th>Plate No.</th>
                          <th>Violator ID</th>
                          <th>Amount</th>
                          <th>Method</th>
                          <th>Location</th>
                          <th>Recorded By</th>
                          <th>Waiting</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedRows.map((row) => (
                          <tr
                            key={row.id}
                            className={row.orphaned ? "row-orphaned" : ""}
                          >
                            <td className="cell-reference">
                              {row.reference}
                              {row.orphaned && (
                                <span title="This payment is not linked to any violation.">
                                  <AlertTriangle
                                    size={14}
                                    className="orphan-icon"
                                    aria-label="Not linked to a violation"
                                  />
                                </span>
                              )}
                            </td>
                            <td className="cell-or-number">
                              {row.orNumber ?? "—"}
                            </td>
                            <td>
                              {row.cin ? (
                                <span className="cin-pill">{row.cin}</span>
                              ) : (
                                <span className="cell-empty">No link</span>
                              )}
                            </td>
                            <td className="cell-plate">
                              {row.plateNo ?? (
                                <span className="cell-empty">—</span>
                              )}
                            </td>
                            <td className="cell-violator">
                              {row.violatorUid || row.guestId ? (
                                <div className="violator-cell">
                                  {row.violatorName && (
                                    <span className="violator-name">
                                      {row.violatorName}
                                    </span>
                                  )}
                                  <span
                                    className="violator-id"
                                    title={row.violatorUid ?? row.guestId ?? ""}
                                  >
                                    {row.violatorUid ?? row.guestId}
                                  </span>
                                </div>
                              ) : row.violatorName ? (
                                <span className="violator-name">
                                  {row.violatorName}
                                </span>
                              ) : (
                                <span className="cell-empty">—</span>
                              )}
                            </td>
                            <td className="cell-amount">
                              {formatCurrency(row.amount)}
                            </td>
                            <td className="cell-method">{row.method}</td>
                            <td>
                              <span
                                className={`location-pill ${getLocationClass(
                                  row.paymentLocation
                                )}`}
                                title={LOCATION_LABELS[row.paymentLocation]}
                              >
                                {row.paymentLocation === "City Hall" && (
                                  <Landmark size={12} />
                                )}
                                {row.paymentLocation === "Central" && (
                                  <Building2 size={12} />
                                )}
                                {row.paymentLocation === "Online" && (
                                  <Smartphone size={12} />
                                )}
                                {LOCATION_LABELS[row.paymentLocation]}
                              </span>
                            </td>
                            <td className="cell-recorded-by">
                              {row.recordedBy ?? "—"}
                            </td>
                            <td>
                              <span
                                className={`waiting-pill ${getWaitingClass(
                                  row.waiting
                                )}`}
                              >
                                {row.waiting}
                              </span>
                            </td>
                            <td className="cell-actions">
                              <button
                                type="button"
                                className="btn-approve"
                                onClick={() =>
                                  handlePaymentAction(row, "Verified")
                                }
                                disabled={
                                  actioning === row.id || row.orphaned
                                }
                                /* ⚠️ CHANGED: title now reflects OIC self-verify permission */
                                title={
                                  row.orphaned
                                    ? "Not linked to a violation"
                                    : row.recordedBy === currentUser.name &&
                                      isOIC
                                    ? "OIC self-verify payment"
                                    : row.recordedBy === currentUser.name &&
                                      row.paymentLocation !== "City Hall"
                                    ? "Cannot verify your own entry"
                                    : row.recordedBy === currentUser.name &&
                                      row.paymentLocation === "City Hall"
                                    ? "Self-verify City Hall payment"
                                    : "Approve payment"
                                }
                              >
                                {actioning === row.id ? "..." : "Approve"}
                              </button>
                              <button
                                type="button"
                                className="btn-reject"
                                onClick={() =>
                                  handlePaymentAction(row, "Rejected")
                                }
                                disabled={
                                  actioning === row.id || row.orphaned
                                }
                              >
                                {actioning === row.id ? "..." : "Reject"}
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
    </div>
  );
}