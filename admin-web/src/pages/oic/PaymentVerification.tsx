import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  KeyRound,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
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
  cin: string | null;
  plateNo: string | null;
  amount: number;
  method: PaymentMethod;
  waiting: WaitingBand;
  status: PaymentStatus;
  verifiedAt: Timestamp | null;
  paidAt: Timestamp | null;
  violationId: string | null;
  clampId: string | null;
  orphaned: boolean;
};

type Metrics = {
  pendingReview: number;
  approvedToday: number;
  rejectedToday: number;
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
        active: true,
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
  });
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

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
            (data.paidAt as Timestamp) ?? (data.createdAt as Timestamp) ?? null;

          return {
            id: d.id,
            reference: data.referenceNumber ?? data.paymentReference ?? d.id,
            cin: ((data.cin ?? data.violationCin) as string) ?? null,
            plateNo: ((data.plateNo ?? data.plateNumber) as string) ?? null,
            amount: Number(data.totalAmount ?? data.amount ?? 0),
            method,
            waiting: computeWaitingBand(paidAt),
            status,
            verifiedAt: (data.verifiedAt as Timestamp) ?? null,
            paidAt,
            violationId: (data.violationId as string) ?? null,
            clampId: (data.clampId as string) ?? null,
            orphaned: false,
          } as PaymentRow;
        });

        const needsLookup = base.filter(
          (r) => r.violationId && (!r.cin || !r.plateNo)
        );
        const uniqueIds = Array.from(
          new Set(needsLookup.map((r) => r.violationId as string))
        );

        const violationCache = new Map<
          string,
          { cin: string | null; plateNo: string | null; clampId: string | null }
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

          return { ...r, cin, plateNo, clampId, orphaned };
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

  /**
   * Approve o reject ang bayad — isang atomic write.
   *
   * ✅ FIX: Kapag Rejected, `paymentStatus` ay naka-set sa "Rejected" — HINDI
   * "Unpaid". Para lumabas yung status na "Payment Rejected" sa AllViolations
   * page (na nagde-derive mula sa `paymentStatus` field).
   */
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

    let rejectionReason = "";
    if (action === "Rejected") {
      const input = window.prompt(
        `Reject payment ${row.reference}?\n\nEnter the reason — the violator will need this to understand why the payment was not accepted:`
      );
      if (input === null) return;
      if (!input.trim()) {
        alert("A rejection reason is required.");
        return;
      }
      rejectionReason = input.trim();
    } else if (
      !window.confirm(
        `Approve payment for ${row.reference}?\n\nCIN: ${
          row.cin ?? "—"
        }\nAmount: ${formatCurrency(row.amount)}\nMethod: ${row.method}`
      )
    ) {
      return;
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
            console.log("Resolved clampId from violation:", resolvedClampId);
          }
        } catch (err) {
          console.warn("Clamp resolution from violation failed:", err);
        }
      }

      const clampRef =
        action === "Verified" ? await findClampRef(resolvedClampId) : null;

      const batch = writeBatch(db);

      // 1. Payment record
      batch.update(doc(db, "payments", row.id), {
        status: action,
        verificationStatus: action,
        verifiedBy: currentUser.name,
        verifiedAt: serverTimestamp(),
        ...(action === "Rejected" ? { rejectionReason } : {}),
      });

      // 2. Violation
      // ✅ FIX: Rejected → "Rejected" (hindi "Unpaid")
      batch.update(violationRef, {
        paymentStatus: action === "Verified" ? "Verified" : "Rejected",
        verifiedBy: currentUser.name,
        verifiedAt: serverTimestamp(),
        ...(action === "Verified"
          ? {
              paymentMethod: row.method,
              paymentReference: row.reference,
              referenceNumber: row.reference,
              totalPaid: row.amount,
              paidAt: row.paidAt ?? serverTimestamp(),
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

      // 3. Clamp — verified lang, para makapasok sa release queue
      if (clampRef) {
        batch.update(clampRef, {
          status: "verified",
          paidAt: serverTimestamp(),
        });
        console.log(`✅ Clamp ${resolvedClampId} updated to "verified"`);
      } else if (action === "Verified") {
        console.warn(
          "⚠️ No linked clamp found — payment verified but clamp not updated.",
          { resolvedClampId, rowClampId: row.clampId }
        );
      }

      // 4. Audit log
      batch.set(doc(collection(db, "auditLogs")), {
        userName: currentUser.name,
        action: `${
          action === "Verified" ? "approved" : "rejected"
        } payment for ${row.cin ?? "(no CIN)"} (${row.reference})`,
        record: row.cin ?? row.reference,
        type: "payment-verification",
        metadata: {
          reference: row.reference,
          cin: row.cin,
          amount: row.amount,
          method: row.method,
          newStatus: action,
          ...(rejectionReason ? { rejectionReason } : {}),
        },
        timestamp: serverTimestamp(),
      });

      await batch.commit();
    } catch (err: any) {
      console.error("Error updating payment:", err);
      alert(err.message || "Failed to update payment.");
    } finally {
      setActioning(null);
    }
  };

  const metricCards = [
    { title: "Pending Review", value: String(metrics.pendingReview) },
    { title: "Approved Today", value: String(metrics.approvedToday) },
    { title: "Rejected Today", value: String(metrics.rejectedToday) },
  ];

  /* Pagination */
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(rows.length / ITEMS_PER_PAGE)),
    [rows.length]
  );
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = rows.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return (
    <div className="oic-page payment-verification-page">
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

            {/* VERIFICATION QUEUE */}
            <div className="card">
              <p className="card-eyebrow">Sector 3 · Oldest first</p>
              <h2 className="card-title">Verification Queue</h2>

              {loading ? (
                <div className="table-loading">
                  <p>Loading verification queue...</p>
                </div>
              ) : rows.length === 0 ? (
                <div className="table-empty">
                  <p>No payments pending review.</p>
                </div>
              ) : (
                <>
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Reference</th>
                          <th>CIN</th>
                          <th>Plate No.</th>
                          <th>Amount</th>
                          <th>Method</th>
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
                                <AlertTriangle
                                  size={14}
                                  className="orphan-icon"
                                  aria-label="Not linked to a violation"
                                  title="This payment is not linked to any violation."
                                />
                              )}
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
                            <td className="cell-amount">
                              {formatCurrency(row.amount)}
                            </td>
                            <td className="cell-method">{row.method}</td>
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
                                title={
                                  row.orphaned
                                    ? "Not linked to a violation"
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
    </div>
  );
}