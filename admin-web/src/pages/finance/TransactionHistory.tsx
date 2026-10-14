import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { signOut as firebaseSignOut } from "firebase/auth";
import { collection, doc, getDoc, onSnapshot, Timestamp } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { useStaffProfile } from "../../lib/useStaffProfile";
import {
  derivePaymentLocation,
  isInStaffScope,
  staffScopeLabel,
  type PaymentLocation,
  type StaffLocation,
} from "../../lib/paymentLocation";
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

type CurrentUser = {
  name: string;
  role: RoleSlug;
  assignedLocation: StaffLocation | null;  // "City Hall" | "Central" — para sa filter
  assignedLocationName: string | null;       // buong pangalan — para sa display
};

type PaymentMethod = "GCash" | "Cash";
type TransactionStatus = "Verified" | "Rejected";

type TransactionRow = {
  id: string;
  reference: string;
  orNumber: string | null;
  cin: string | null;
  plateNo: string | null;
  amount: number;
  method: PaymentMethod | null;
  verifiedBy: string;
  verifiedAt: Timestamp | null;
  status: TransactionStatus;
  rejectionReason: string | null;
  violatorUid: string | null;
  guestId: string | null;
  violatorName: string | null;
  paymentLocation: PaymentLocation;
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

/* Finance navigation — ito lang ang naiiba sa OIC version */
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Dashboard",
    items: [{ label: "Overview", icon: overviewIcon, path: "/finance" }],
  },
  {
    label: "Payment/Finance",
    items: [
      { label: "Pending Payments", icon: pendingPaymentsIcon, path: "/finance/pending" },
      { label: "Payment Verification", icon: paymentVerificationIcon, path: "/finance/verification" },
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

/** GCash → "Online"; cash → City Hall / Central (tingnan ang lib/paymentLocation) */
const derivePaymentLocationFromDoc = (data: any): PaymentLocation =>
  derivePaymentLocation(data.method, data.paymentLocation ?? data.location);

const getStatusClass = (status: TransactionStatus): string =>
  status === "Rejected" ? "status-rejected" : "status-verified";

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function TransactionHistory() {
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

  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  /* Payments listener */
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
              reference: data.referenceNumber ?? data.paymentReference ?? d.id,
              orNumber: (data.orNumber as string) ?? null,
              cin: ((data.cin ?? data.violationCin) as string) ?? null,
              plateNo: ((data.plateNo ?? data.plateNumber) as string) ?? null,
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
              violatorUid: (data.violatorUid as string) ?? null,
              guestId: (data.guestId as string) ?? null,
              violatorName: (data.violatorName as string) ?? null,
              paymentLocation: derivePaymentLocationFromDoc(data),
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);

        const uniqueIds = Array.from(
          new Set(
            base
              .filter(
                (r) =>
                  r.violationId &&
                  (!r.cin ||
                    !r.plateNo ||
                    (!r.violatorUid && !r.guestId && !r.violatorName))
              )
              .map((r) => r.violationId as string)
          )
        );

        const cache = new Map<
          string,
          {
            cin: string | null;
            plateNo: string | null;
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
                cache.set(vId, {
                  cin: v.cin ?? null,
                  plateNo: v.plateNo ?? null,
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

        const enriched: TransactionRow[] = base
          .map(({ violationId, ...r }) => {
            const linked = violationId ? cache.get(violationId) : undefined;
            return {
              ...r,
              cin: r.cin ?? linked?.cin ?? null,
              plateNo: r.plateNo ?? linked?.plateNo ?? null,
              violatorUid: r.violatorUid ?? linked?.violatorUid ?? null,
              guestId: r.guestId ?? linked?.guestId ?? null,
              violatorName: r.violatorName ?? linked?.violatorName ?? null,
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
    setIsMenuOpen(false);
  };

  /* Location — Finance staff: sariling location lang (City Hall o Central).
     Ginagawa dito sa render (hindi sa listener) para hindi na kailangang
     mag-resubscribe sa Firestore kapag na-load ang user. */
  const locationRows = useMemo(() => {
    if (!userReady) return [];
    if (currentUser.role !== "finance") return rows;
    return rows.filter((r) =>
      isInStaffScope(currentUser.assignedLocation, r.paymentLocation)
    );
  }, [rows, userReady, currentUser.role, currentUser.assignedLocation]);

  /* Search — OR Number, CIN, plate, reference, at pangalan ng violator */
  const filteredRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return locationRows;
    return locationRows.filter(
      (row) =>
        (row.cin ?? "").toLowerCase().includes(q) ||
        (row.plateNo ?? "").toLowerCase().includes(q) ||
        row.reference.toLowerCase().includes(q) ||
        (row.orNumber ?? "").toLowerCase().includes(q) ||
        (row.violatorName ?? "").toLowerCase().includes(q)
    );
  }, [locationRows, searchQuery]);

  /* Pagination */
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = filteredRows.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  return (
    <div className="finance-page finance-transactions-page">
      <div className="dashboard">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <img src={mtpbLogo} alt="MTPB Logo" className="sidebar-logo-img" />
            <div>
              <p className="sidebar-brand-name">MTPB</p>
              <p className="sidebar-brand-role">
                Finance Staff
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
                      {currentUser.assignedLocationName &&
                        ` · ${currentUser.assignedLocationName}`}
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
            {/* SEARCH */}
            <div className="search-bar-container">
              <Search size={18} className="search-bar-icon" />
              <input
                type="text"
                className="search-bar-input"
                placeholder="Search OR, CIN, plate, reference, or violator..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="card">
              <p className="card-eyebrow">
                Sector 3 ·{" "}
                {currentUser.role === "finance" && currentUser.assignedLocation
                  ? `${staffScopeLabel(currentUser.assignedLocation)} records`
                  : "All records"}
              </p>
              <h2 className="card-title">History</h2>

              {loading || !userReady ? (
                <div className="table-loading">
                  <p>Loading transactions...</p>
                </div>
              ) : paginatedRows.length === 0 ? (
                <div className="table-empty">
                  <p>
                    {locationRows.length === 0
                      ? "No transaction history yet."
                      : "No transactions match your search."}
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
                          <th>Violator</th>
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
                            <td className="cell-or-number">
                              {row.orNumber ?? (
                                <span className="cell-empty">—</span>
                              )}
                            </td>
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
                            {/* Violator — pangalan + Registered/Guest tag (walang ID) */}
                            <td className="cell-violator">
                              {row.violatorName || row.violatorUid || row.guestId ? (
                                <div className="violator-cell">
                                  {row.violatorName && (
                                    <span className="violator-name">
                                      {row.violatorName}
                                    </span>
                                  )}
                                  {(row.violatorUid || row.guestId) && (
                                    <span
                                      className={`violator-tag ${
                                        row.violatorUid ? "uid" : "guest"
                                      }`}
                                    >
                                      {row.violatorUid ? "Registered" : "Guest"}
                                    </span>
                                  )}
                                </div>
                              ) : (
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
                      onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
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
                        setCurrentPage(Math.min(totalPages, safePage + 1))
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