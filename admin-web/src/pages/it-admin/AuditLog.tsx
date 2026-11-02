import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  Activity,
  DatabaseBackup,
  Users,
  ShieldCheck,
  Monitor,
  FileText,
  Lock,
  Settings,
  RefreshCw,
  Search,
  Calendar,
  AlertTriangle,
  X,
  QrCode,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  limit,
  Timestamp,
  type DocumentData
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./ITAdminHomepage.css";
import "./AuditLog.css";

import AppTopbar from "../../components/AppTopbar";
import AppSidebar from "../../components/AppSidebar";

/* ------------------------------------------------------------------
   TYPES
------------------------------------------------------------------ */
type NavItem = {
  label: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  path: string;
  active?: boolean;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

type RoleSlug =
  | "oic"
  | "it-admin"
  | "supervisor"
  | "record-officer"
  | "release-officer"
  | "finance"
  | "clamping-staff"
  | "impounding-staff"
  | "system";

type CurrentUser = {
  name: string;
  role: RoleSlug;
};

type LogCategory =
  | "Release"
  | "Clamping"
  | "Impounding"
  | "Auth"
  | "Users"
  | "System";

type CategoryFilter = "All" | LogCategory;

type AuditLogRow = {
  id: string;
  timestamp: Timestamp | null;
  time: string;
  userName: string;
  role: RoleSlug;
  action: string;
  record: string;
  ipAddress: string;
  flagged: boolean;
  category: LogCategory;
  metadata?: DocumentData;
};

type AuditLogFull = AuditLogRow & {
  before?: string;
  after?: string;
  systemNotes?: string;
};

/* ------------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------------ */
const PAGE_SIZE = 10;

const CATEGORY_FILTERS: CategoryFilter[] = [
  "All",
  "Release",
  "Clamping",
  "Impounding",
  "Auth",
  "Users",
  "System",
];

/* ------------------------------------------------------------------
   ROLE MAP
------------------------------------------------------------------ */

/* Labels shown in the table pills (matches the design) */
const ROLE_SHORT_LABELS: Record<RoleSlug, string> = {
  "oic": "OIC",
  "it-admin": "IT Admin",
  "supervisor": "Supervisor",
  "record-officer": "Record Officer",
  "release-officer": "Release Officer",
  "finance": "Finance",
  "clamping-staff": "Clamping",
  "impounding-staff": "Impounding",
  "system": "System",
};

const ROLE_BADGE_CLASS: Record<RoleSlug, string> = {
  "oic": "role-oic",
  "it-admin": "role-it",
  "supervisor": "role-admin",
  "record-officer": "role-admin",
  "release-officer": "role-release",
  "finance": "role-finance",
  "clamping-staff": "role-clamping",
  "impounding-staff": "role-impounding",
  "system": "role-system",
};

/**
 * The role of whoever did it. Most entries (admin pages, enforcer app,
 * violator app server) write `userRole`; a few older ones write `role`.
 * Labels like "IT Admin" are turned into their slug. Anything unknown
 * (e.g. "violator-app") shows as System.
 */
const roleOf = (data: { role?: unknown; userRole?: unknown }): RoleSlug => {
  const raw = String(data.role ?? data.userRole ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  return raw in ROLE_SHORT_LABELS ? (raw as RoleSlug) : "system";
};

/* ------------------------------------------------------------------
   NAV
------------------------------------------------------------------ */
const navGroups: NavGroup[] = [
  {
    title: "Dashboard",
    items: [{ label: "Overview", icon: LayoutDashboard, path: "/it-admin" }],
  },
  {
    title: "Monitoring",
    items: [
      { label: "System Health", icon: Activity, path: "/it-admin/system-health" },
      { label: "Backup & Restore", icon: DatabaseBackup, path: "/it-admin/backup" },
    ],
  },
  {
    title: "Access Control",
    items: [
      { label: "User Management", icon: Users, path: "/it-admin/users" },
      { label: "Roles & Permissions", icon: ShieldCheck, path: "/it-admin/roles" },
      { label: "Session Monitor", icon: Monitor, path: "/it-admin/sessions" },
    ],
  },
  {
    title: "Enforcement Tools",
    items: [
      { label: "QR Code Management", icon: QrCode, path: "/it-admin/qr-codes" },
    ],
  },
  {
    title: "Audit & Compliance",
    items: [
      { label: "Audit Log", icon: FileText, path: "/it-admin/audit-log", active: true },
      { label: "Data Privacy Log", icon: Lock, path: "/it-admin/data-privacy" },
    ],
  },
  {
    title: "Configuration",
    items: [{ label: "Settings", icon: Settings, path: "/it-admin/settings" }],
  },
];

/* ------------------------------------------------------------------
   HELPERS
------------------------------------------------------------------ */
const formatTime = (ts: Timestamp | null): string => {
  if (!ts) return "—";
  try {
    return ts.toDate().toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch {
    return "—";
  }
};

const formatDateForInput = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const VALID_CATEGORIES: LogCategory[] = [
  "Release",
  "Clamping",
  "Impounding",
  "Auth",
  "Users",
  "System",
];

/**
 * Payment entries are left out of the IT Admin's Audit Log: payments
 * (cash, GCash, verification, OR numbers, amounts) belong to Finance and
 * the OIC, not to IT. Matched by the log's type, its category, the payment
 * details in its metadata, or the wording of the action.
 */
const isPaymentLog = (data: DocumentData): boolean => {
  const type = String(data.type ?? "").toLowerCase();
  if (/payment|cash|gcash|revenue|finance|receipt|refund/.test(type)) return true;
  if (String(data.category ?? "").toLowerCase() === "payment") return true;
  const meta = (data.metadata ?? {}) as DocumentData;
  if (meta.paymentId || meta.orNumber || meta.cashReceived != null) return true;
  const action = String(data.action ?? "").toLowerCase();
  return /payment|paid|receipt|\bor\s*(no\.?|#|number)|cash|gcash|impound(ing)? fee|refund|revenue/.test(
    action
  );
};

/**
 * Uses the `category` field from Firestore if present.
 * Otherwise, infers the category from the action text.
 */
const resolveCategory = (rawCategory: unknown, action: string): LogCategory => {
  if (typeof rawCategory === "string") {
    const match = VALID_CATEGORIES.find(
      (c) => c.toLowerCase() === rawCategory.toLowerCase()
    );
    if (match) return match;
  }

  const a = action.toLowerCase();
  if (/(login|logout|log in|log out|password|sign in|sign out|auth)/.test(a)) return "Auth";
  if (/release/.test(a)) return "Release";
  if (/clamp/.test(a)) return "Clamping";
  if (/impound/.test(a)) return "Impounding";
  if (/(user|account|role|permission)/.test(a)) return "Users";
  return "System";
};

/* ------------------------------------------------------------------
   VIEW DETAILS MODAL
------------------------------------------------------------------ */
type ViewModalProps = {
  row: AuditLogFull;
  onClose: () => void;
};

function ViewModal({ row, onClose }: ViewModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Audit log event details</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-row">
            <div className="form-field">
              <label>Timestamp</label>
              <input type="text" value={row.time} readOnly />
            </div>
            <div className="form-field">
              <label>IP address</label>
              <input type="text" value={row.ipAddress} readOnly />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>User</label>
              <input type="text" value={row.userName} readOnly />
            </div>
            <div className="form-field">
              <label>Role</label>
              <input
                type="text"
                value={ROLE_SHORT_LABELS[row.role] ?? row.role}
                readOnly
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Action</label>
              <input type="text" value={row.action} readOnly />
            </div>
            <div className="form-field">
              <label>Record / Target</label>
              <input type="text" value={row.record} readOnly />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Before</label>
              <textarea value={row.before ?? "—"} readOnly rows={4} />
            </div>
            <div className="form-field">
              <label>After</label>
              <textarea value={row.after ?? "—"} readOnly rows={4} />
            </div>
          </div>

          <div className="form-field">
            <label>System notes</label>
            <textarea value={row.systemNotes ?? "—"} readOnly rows={3} />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-cancel" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   MAIN COMPONENT
------------------------------------------------------------------ */
export default function AuditLog() {

  const [, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "it-admin",
  });

  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>(
    formatDateForInput(new Date())
  );
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [viewingLog, setViewingLog] = useState<AuditLogFull | null>(null);

  /* Fetch current user */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) {
        setCurrentUser({ name: "Guest", role: "it-admin" });
        return;
      }
      try {
        const userDocSnap = await getDoc(doc(db, "users", loggedUser.uid));
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          setCurrentUser({
            name: data.name ?? "Unknown",
            role: (data.role ?? "it-admin") as RoleSlug,
          });
        } else {
          setCurrentUser({
            name: loggedUser.email?.split("@")[0] ?? "Unknown",
            role: "it-admin",
          });
        }
      } catch (err) {
        console.error("Error fetching current user:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  /* Real-time: auditLogs collection */
  useEffect(() => {
    const auditQuery = query(
      collection(db, "auditLogs"),
      orderBy("timestamp", "desc"),
      limit(500)
    );

    const unsubscribe = onSnapshot(
      auditQuery,
      (snapshot) => {
        const fetched: AuditLogRow[] = snapshot.docs
          .filter((d) => !isPaymentLog(d.data()))
          .map((d) => {
            const data = d.data();
            const action: string = data.action ?? "";
            return {
              id: d.id,
              timestamp: data.timestamp ?? null,
              time: formatTime(data.timestamp ?? null),
              userName: data.userName ?? "Unknown",
              role: roleOf(data),
              action,
              record: data.record ?? data.targetId ?? "—",
              ipAddress: data.ipAddress ?? "—",
              flagged: data.flagged === true,
              category: resolveCategory(data.category, action),
              metadata: data.metadata,
            };
          });
        setLogs(fetched);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching audit logs:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  /* Filter logs: search + date + category */
  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return logs.filter((log) => {
      if (q) {
        const roleLabel = (ROLE_SHORT_LABELS[log.role] ?? log.role).toLowerCase();
        const matchesSearch =
          log.userName.toLowerCase().includes(q) ||
          log.action.toLowerCase().includes(q) ||
          log.record.toLowerCase().includes(q) ||
          log.ipAddress.toLowerCase().includes(q) ||
          roleLabel.includes(q);
        if (!matchesSearch) return false;
      }

      if (selectedDate) {
        if (!log.timestamp) return false;
        if (formatDateForInput(log.timestamp.toDate()) !== selectedDate) return false;
      }

      if (activeCategory !== "All" && log.category !== activeCategory) return false;

      return true;
    });
  }, [logs, searchQuery, selectedDate, activeCategory]);

  /* Pagination */
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));

  const pagedLogs = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredLogs.slice(start, start + PAGE_SIZE);
  }, [filteredLogs, currentPage]);

  // Back to page 1 when these change (during render, not in an effect)
  const pageResetKey = JSON.stringify([searchQuery, selectedDate, activeCategory]);
  const [prevPageResetKey, setPrevPageResetKey] = useState(pageResetKey);
  if (pageResetKey !== prevPageResetKey) {
    setPrevPageResetKey(pageResetKey);
    setCurrentPage(1);
  }

  // Keep the page valid if the list shrinks (during render)
  if (currentPage > totalPages) setCurrentPage(totalPages);

  // Sync the page box with the current page (during render)
  const [prevCurrentPage, setPrevCurrentPage] = useState(currentPage);
  if (currentPage !== prevCurrentPage) {
    setPrevCurrentPage(currentPage);
    setPageInput(String(currentPage));
  }

  const goToPage = (page: number) => {
    const clamped = Math.min(Math.max(1, page), totalPages);
    setCurrentPage(clamped);
    setPageInput(String(clamped));
  };

  const commitPageInput = () => {
    const parsed = parseInt(pageInput, 10);
    if (Number.isNaN(parsed)) {
      setPageInput(String(currentPage));
      return;
    }
    goToPage(parsed);
  };

  const handleView = (row: AuditLogRow) => {
    setViewingLog({
      ...row,
      before: row.metadata?.before,
      after: row.metadata?.after,
      systemNotes: row.metadata?.systemNotes,
    });
  };

  return (
    <div className="it-admin-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <AppSidebar groups={navGroups} role={<>IT Admin</>} />

        {/* MAIN */}
        <main className="main">
          <AppTopbar groups={navGroups} />
          <header className="main-header">
            <div>
              <h1>Audit Log</h1>
              <p>
                {new Date().toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>

          </header>

          <div className="audit-content">
            {/* Search + Date */}
            <div className="audit-toolbar">
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search User, Action, Record..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <Search size={20} className="search-icon" />
              </div>

              <div className="date-box">
                <input
                  type="date"
                  aria-label="Filter by date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
                <Calendar size={20} className="date-icon" />
              </div>
            </div>

            {/* Category chips */}
            <div className="audit-filters" role="tablist" aria-label="Filter by category">
              {CATEGORY_FILTERS.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={activeCategory === cat}
                  className={`filter-chip${activeCategory === cat ? " active" : ""}`}
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Table card */}
            <article className="card audit-card">
              {loading ? (
                <div className="table-loading">
                  <RefreshCw size={20} className="spin" />
                  <p>Loading audit logs...</p>
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="table-empty">
                  <p>No audit log entries found for the selected filters.</p>
                </div>
              ) : (
                <div className="audit-table-wrap">
                  <table className="audit-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>User</th>
                        <th>Role</th>
                        <th>Action</th>
                        <th>Record</th>
                        <th>IP address</th>
                        <th aria-label="Actions"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedLogs.map((row) => (
                        <tr key={row.id} className={row.flagged ? "row-flagged" : ""}>
                          <td className="cell-time">{row.time}</td>
                          <td className="cell-user">{row.userName}</td>
                          <td>
                            <span
                              className={`audit-role-pill ${
                                ROLE_BADGE_CLASS[row.role] ?? "role-system"
                              }`}
                            >
                              {ROLE_SHORT_LABELS[row.role] ?? row.role}
                            </span>
                          </td>
                          <td className="cell-action">
                            {row.flagged && (
                              <AlertTriangle size={13} className="flagged-icon" />
                            )}
                            {row.action}
                          </td>
                          <td className="cell-record">{row.record}</td>
                          <td className="cell-ip">{row.ipAddress}</td>
                          <td className="cell-action-btn">
                            <button
                              type="button"
                              className={row.flagged ? "btn-flagged" : "btn-view"}
                              onClick={() => handleView(row)}
                            >
                              {row.flagged ? "Flagged" : "View"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {!loading && filteredLogs.length > 0 && (
                <div className="audit-pagination">
                  <button
                    type="button"
                    className="page-btn"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft size={16} />
                    <span>Previous</span>
                  </button>

                  <div className="page-indicator">
                    <input
                      type="text"
                      inputMode="numeric"
                      className="page-input"
                      aria-label="Current page"
                      value={pageInput}
                      onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
                      onBlur={commitPageInput}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitPageInput();
                      }}
                    />
                    <span>
                      of {totalPages} {totalPages === 1 ? "page" : "pages"}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="page-btn"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    <span>Next</span>
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </article>

            <div style={{ height: 24 }} />
          </div>
        </main>
      </div>

      {viewingLog && (
        <ViewModal row={viewingLog} onClose={() => setViewingLog(null)} />
      )}
    </div>
  );
}