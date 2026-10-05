import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  QrCode,              // ✅ ADDED
} from "lucide-react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  limit,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./ITAdminHomePage.css";
import "./AuditLog.css";

import logo from "../../assets/mtpb-logo.png";
import avatarImg from "../../assets/user.png";
import logoutIcon from "../../assets/logout.png";
import keyIcon from "../../assets/key.png";

/* ------------------------------------------------------------------
   TYPES
------------------------------------------------------------------ */
type NavItem = {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
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
  metadata?: Record<string, any>;
};

type AuditLogFull = AuditLogRow & {
  before?: string;
  after?: string;
  systemNotes?: string;
};

/* ------------------------------------------------------------------
   ROLE MAP
------------------------------------------------------------------ */
const ROLE_LABELS: Record<RoleSlug, string> = {
  "oic": "Officer-in-Charge",
  "it-admin": "IT Admin",
  "supervisor": "Supervisor",
  "record-officer": "Record Officer",
  "release-officer": "Release Officer",
  "finance": "Finance",
  "clamping-staff": "Clamping Staff",
  "impounding-staff": "Impounding Staff",
  "system": "System",
};

const ROLE_SHORT_LABELS: Record<RoleSlug, string> = {
  "oic": "OIC",
  "it-admin": "IT Admin",
  "supervisor": "Admin Staff",
  "record-officer": "Admin Staff",
  "release-officer": "Release",
  "finance": "Enforcer",
  "clamping-staff": "Clamping Leader",
  "impounding-staff": "Impounding",
  "system": "System",
};

const ROLE_BADGE_CLASS: Record<RoleSlug, string> = {
  "oic": "role-oic",
  "it-admin": "role-it",
  "supervisor": "role-admin",
  "record-officer": "role-admin",
  "release-officer": "role-release",
  "finance": "role-enforcer",
  "clamping-staff": "role-clamping",
  "impounding-staff": "role-impounding",
  "system": "role-system",
};

/* ------------------------------------------------------------------
   NAV — ✅ QR Codes added sa "Enforcement Tools" group
------------------------------------------------------------------ */
const navGroups: NavGroup[] = [
  {
    title: "Dashboard",
    items: [
      { label: "Overview", icon: LayoutDashboard, path: "/it-admin" },
    ],
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
      { label: "QR Codes", icon: QrCode, path: "/it-admin/qr-codes" },
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
    items: [
      { label: "Settings", icon: Settings, path: "/it-admin/settings" },
    ],
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
          <h2 className="modal-title">Audit log — event details</h2>
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
                value={ROLE_SHORT_LABELS[row.role] || row.role}
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
            Cancel
          </button>
          <button type="button" className="btn-save" onClick={onClose}>
            Save Changes
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "it-admin",
  });

  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>(
    formatDateForInput(new Date())
  );
  const [viewingLog, setViewingLog] = useState<AuditLogFull | null>(null);

  /* Fetch current user */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) {
        setCurrentUser({ name: "Guest", role: "it-admin" });
        return;
      }
      try {
        const userDocRef = doc(db, "users", loggedUser.uid);
        const userDocSnap = await getDoc(userDocRef);
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
    const auditRef = collection(db, "auditLogs");
    const auditQuery = query(auditRef, orderBy("timestamp", "desc"), limit(200));

    const unsubscribe = onSnapshot(
      auditQuery,
      (snapshot) => {
        const fetched: AuditLogRow[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            timestamp: data.timestamp ?? null,
            time: formatTime(data.timestamp),
            userName: data.userName ?? "Unknown",
            role: (data.role ?? "system") as RoleSlug,
            action: data.action ?? "",
            record: data.record ?? data.targetId ?? "—",
            ipAddress: data.ipAddress ?? "—",
            flagged: data.flagged === true,
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

  /* Click-outside + Escape */
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setViewingLog(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await firebaseSignOut(auth);
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      sessionStorage.clear();
      setMenuOpen(false);
      navigate("/");
    } catch (err) {
      console.error("Logout error:", err);
      setMenuOpen(false);
      navigate("/");
    }
  };

  /* Filter logs based on search + date */
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesSearch =
          log.userName.toLowerCase().includes(q) ||
          log.action.toLowerCase().includes(q) ||
          log.record.toLowerCase().includes(q) ||
          log.role.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }

      if (selectedDate && log.timestamp) {
        const logDate = formatDateForInput(log.timestamp.toDate());
        if (logDate !== selectedDate) return false;
      }

      return true;
    });
  }, [logs, searchQuery, selectedDate]);

  const handleView = (row: AuditLogRow) => {
    const full: AuditLogFull = {
      ...row,
      before: row.metadata?.before,
      after: row.metadata?.after,
      systemNotes: row.metadata?.systemNotes,
    };
    setViewingLog(full);
  };

  return (
    <div className="it-admin-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <img src={logo} alt="MTPB logo" className="sidebar-logo-img" />
            <div>
              <p className="sidebar-brand-name">MTPB</p>
              <p className="sidebar-brand-role">IT Admin</p>
            </div>
          </div>
          <nav className="sidebar-nav">
            {navGroups.map((group) => (
              <div className="nav-group" key={group.title}>
                <p className="nav-group-title">{group.title}</p>
                <ul className="nav-list">
                  {group.items.map((item) => {
                    const IconComponent = item.icon;
                    return (
                      <li key={item.label}>
                        <button
                          type="button"
                          className={`nav-item${item.active ? " active" : ""}`}
                          onClick={() => navigate(item.path)}
                        >
                          <IconComponent size={16} className="nav-icon-svg" />
                          <span>{item.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* MAIN */}
        <main className="main">
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

            <div className="avatar-container" ref={menuRef}>
              <img
                src={avatarImg}
                alt="Account menu"
                className="avatar-img"
                onClick={() => setMenuOpen((open) => !open)}
              />
              {menuOpen && (
                <div className="profile-dropdown" role="menu">
                  <div className="dropdown-header">
                    <p className="dropdown-name">{currentUser.name}</p>
                    <p className="dropdown-role">{ROLE_LABELS[currentUser.role]}</p>
                  </div>
                  <button
                    type="button"
                    className="dropdown-item"
                    onClick={() => setMenuOpen(false)}
                  >
                    <img src={keyIcon} alt="" className="dropdown-icon" />
                    <span>Change Password</span>
                  </button>
                  <button
                    type="button"
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

          <div className="audit-content">
            {/* Search + Date filter row */}
            <div className="audit-toolbar">
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search User, Action, Record..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <Search size={18} className="search-icon" />
              </div>

              <div className="date-box">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
                <Calendar size={18} className="date-icon" />
              </div>
            </div>

            {/* Audit Log table */}
            <article className="card">
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
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>User</th>
                      <th>Role</th>
                      <th>Action</th>
                      <th>Record</th>
                      <th>IP address</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((row) => (
                      <tr key={row.id} className={row.flagged ? "row-flagged" : ""}>
                        <td className="cell-time">{row.time}</td>
                        <td className="cell-user">{row.userName}</td>
                        <td>
                          <span className={`audit-role-pill ${ROLE_BADGE_CLASS[row.role]}`}>
                            {ROLE_SHORT_LABELS[row.role]}
                          </span>
                        </td>
                        <td className="cell-action">
                          {row.flagged && (
                            <AlertTriangle
                              size={14}
                              className="flagged-icon"
                              style={{ display: "inline", marginRight: 6 }}
                            />
                          )}
                          {row.action}
                        </td>
                        <td className="cell-record">{row.record}</td>
                        <td className="cell-ip">{row.ipAddress}</td>
                        <td className="cell-action-btn">
                          {row.flagged ? (
                            <button
                              type="button"
                              className="btn-flagged"
                              onClick={() => handleView(row)}
                            >
                              Flagged
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-view"
                              onClick={() => handleView(row)}
                            >
                              View
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </article>

            <div style={{ height: 24 }} />
          </div>
        </main>
      </div>

      {/* VIEW MODAL */}
      {viewingLog && (
        <ViewModal row={viewingLog} onClose={() => setViewingLog(null)} />
      )}
    </div>
  );
}