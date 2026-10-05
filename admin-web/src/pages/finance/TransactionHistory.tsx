import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, ChevronLeft, ChevronRight } from "lucide-react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./TransactionHistory.css";

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

type PaymentMethod = "GCash" | "Cash";
type TransactionStatus = "Verified" | "Rejected";

type TransactionRow = {
  id: string;
  reference: string;
  cin: string | null;
  plateNo: string | null;
  amount: number;
  method: PaymentMethod | null;
  verifiedBy: string;
  verifiedAt: Timestamp | null;
  status: TransactionStatus;
  rejectionReason: string | null;
};

type NavItem = { label: string; icon: string; path: string; active?: boolean };
type NavGroup = { label: string; items: NavItem[] };

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------
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
    items: [{ label: "Overview", icon: overviewIcon, path: "/finance" }],
  },
  {
    label: "Payment/Finance",
    items: [
      {
        label: "Pending Payments",
        icon: pendingPaymentsIcon,
        path: "/finance/pending",
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
        active: true,
      },
      { label: "Revenue Reports", icon: revenueIcon, path: "/finance/revenue" },
    ],
  },
  {
    label: "Reports",
    items: [
      { label: "All Reports", icon: allReportsIcon, path: "/finance/reports" },
      {
        label: "Export Center",
        icon: exportCenterIcon,
        path: "/finance/export",
      },
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

const formatDateTime = (ts: Timestamp | null): string => {
  if (!ts) return "—";
  try {
    return ts.toDate().toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

const millis = (ts: Timestamp | null): number => {
  try {
    return ts ? ts.toMillis() : 0;
  } catch {
    return 0;
  }
};

const getStatusClass = (status: TransactionStatus): string =>
  status === "Rejected" ? "status-rejected" : "status-verified";

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------
export default function TransactionHistory() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "finance",
  });

  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  /* Current user */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) {
        setCurrentUser({ name: "Guest", role: "finance" });
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", loggedUser.uid));
        if (snap.exists()) {
          const data = snap.data();
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
    const unsubscribe = onSnapshot(
      collection(db, "payments"),
      async (snap) => {
        const base = snap.docs
          .map((d) => {
            const data = d.data();

            const rawStatus = String(
              data.verificationStatus ?? data.status ?? ""
            ).toLowerCase();

            const status: TransactionStatus | null = [
              "verified",
              "succeeded",
              "approved",
            ].includes(rawStatus)
              ? "Verified"
              : ["rejected", "failed", "declined"].includes(rawStatus)
              ? "Rejected"
              : null;

            // Pending pa — wala pa sa history.
            if (!status) return null;

            const rawMethod = String(data.method ?? "").toLowerCase();
            const method: PaymentMethod | null =
              rawMethod === "gcash"
                ? "GCash"
                : rawMethod === "cash"
                ? "Cash"
                : null;

            return {
              id: d.id,
              reference:
                data.referenceNumber ?? data.paymentReference ?? d.id,
              // Tatlong naming convention ang ginagamit ng iba't ibang
              // sumusulat sa collection na ito.
              cin: ((data.cin ?? data.violationCin) as string) ?? null,
              plateNo: ((data.plateNo ?? data.plateNumber) as string) ?? null,
              // totalAmount muna — kasama na ang convenience fee. Sa amount
              // lang, ang multa ang ipinapakita, hindi ang binayaran.
              amount: Number(data.totalAmount ?? data.amount ?? 0),
              method,
              verifiedBy: data.verifiedBy ?? "—",
              verifiedAt:
                (data.verifiedAt as Timestamp) ??
                (data.paidAt as Timestamp) ??
                (data.createdAt as Timestamp) ??
                null,
              status,
              rejectionReason: (data.rejectionReason as string) ?? null,
              violationId: (data.violationId as string) ?? null,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);

        // Kunin ang kulang na CIN at plate mula sa naka-link na violation.
        const uniqueIds = Array.from(
          new Set(
            base
              .filter((r) => r.violationId && (!r.cin || !r.plateNo))
              .map((r) => r.violationId as string)
          )
        );

        const cache = new Map<
          string,
          { cin: string | null; plateNo: string | null }
        >();

        await Promise.all(
          uniqueIds.map(async (vId) => {
            try {
              const vSnap = await getDoc(doc(db, "violations", vId));
              if (vSnap.exists()) {
                const v = vSnap.data();
                cache.set(vId, {
                  cin: v.cin ?? null,
                  plateNo: v.plateNo ?? null,
                });
              }
            } catch (err) {
              console.warn(`Violation ${vId} lookup failed:`, err);
            }
          })
        );

        const enriched: TransactionRow[] = base
          .map(({ violationId, ...r }) => {
            const linked = violationId ? cache.get(violationId) : undefined;
            return {
              ...r,
              cin: r.cin ?? linked?.cin ?? null,
              plateNo: r.plateNo ?? linked?.plateNo ?? null,
            };
          })
          .sort((a, b) => millis(b.verifiedAt) - millis(a.verifiedAt));

        setRows(enriched);
        setLoading(false);
      },
      (err) => {
        console.warn("Transaction history fetch failed:", err.code);
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

  const handleChangePassword = () => {
    console.log("Navigating to Change Password...");
    setIsMenuOpen(false);
  };

  /* Pagination */
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(rows.length / ITEMS_PER_PAGE)),
    [rows.length]
  );
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = rows.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

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
                        className={`nav-item ${
                          item.active ? "nav-item-active" : ""
                        }`}
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
              <h1>Transaction History</h1>
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
                  <button
                    className="dropdown-item"
                    onClick={handleChangePassword}
                  >
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
            <div className="card">
              <p className="card-eyebrow">Sector 3 · All records</p>
              <h2 className="card-title">History</h2>

              {loading ? (
                <div className="table-loading">
                  <p>Loading transactions...</p>
                </div>
              ) : rows.length === 0 ? (
                <div className="table-empty">
                  <p>No transaction history yet.</p>
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
                          <th>Status</th>
                          <th>Verified by</th>
                          <th>Date &amp; Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedRows.map((row) => (
                          <tr key={row.id}>
                            <td className="cell-reference">{row.reference}</td>
                            <td>
                              {row.cin ? (
                                <span className="cin-pill">{row.cin}</span>
                              ) : (
                                <span className="cell-empty">—</span>
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
                            <td className="cell-method">
                              {row.method ?? (
                                <span className="cell-empty">Not recorded</span>
                              )}
                            </td>
                            <td>
                              <span
                                className={`status-pill ${getStatusClass(
                                  row.status
                                )}`}
                                title={row.rejectionReason ?? undefined}
                              >
                                {row.status}
                              </span>
                            </td>
                            <td className="cell-verified-by">
                              {row.verifiedBy}
                            </td>
                            <td className="cell-datetime">
                              {formatDateTime(row.verifiedAt)}
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
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft size={16} />
                      Previous
                    </button>

                    <div className="pagination-info">
                      <span className="pagination-page">{currentPage}</span>
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
                      disabled={currentPage === totalPages}
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