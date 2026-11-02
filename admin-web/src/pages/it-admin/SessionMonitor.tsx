import { useEffect, useState } from "react";
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
  AlertTriangle,
  QrCode,
} from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import { ACTIVE_WINDOW_MS } from "../../lib/staffSession";
import "./ITAdminHomepage.css";
import "./SessionMonitor.css";

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
  | "impounding-staff";

type CurrentUser = {
  uid: string;
  name: string;
  role: RoleSlug;
};

type SessionRow = {
  id: string;
  userId: string;
  userName: string;
  role: RoleSlug;
  device: string;
  ipAddress: string;
  loginTime: string;
  lastActive: string;
  /** Last heartbeat (ms); sessions quiet for 30 min are hidden. */
  lastActiveMs: number;
  /** Closed by logging out, or revoked by the IT Admin. */
  closed: boolean;
};

/* ------------------------------------------------------------------
   ROLE MAP
------------------------------------------------------------------ */

const ROLE_SHORT_LABELS: Record<RoleSlug, string> = {
  "oic": "OIC",
  "it-admin": "IT Admin",
  "supervisor": "Admin Staff",
  "record-officer": "Admin Staff",
  "release-officer": "Release",
  "finance": "Finance",
  "clamping-staff": "Clamping Leader",
  "impounding-staff": "Impounding",
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
};

/* ------------------------------------------------------------------
   NAV — QR Codes added sa "Enforcement Tools"
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
      { label: "Session Monitor", icon: Monitor, path: "/it-admin/sessions", active: true },
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
      { label: "Audit Log", icon: FileText, path: "/it-admin/audit-log" },
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
const formatTime = (date: Date): string => {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function SessionMonitor() {

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    uid: "",
    name: "Loading...",
    role: "it-admin",
  });

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  /** Re-checked every minute so quiet sessions drop off the list. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const activeSessions = sessions.filter(
    (row) => !row.closed && now - row.lastActiveMs <= ACTIVE_WINDOW_MS
  );
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  /* ================================================================
     Fetch current user
  ================================================================ */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) {
        setCurrentUser({ uid: "", name: "Guest", role: "it-admin" });
        return;
      }
      try {
        const userDocRef = doc(db, "users", loggedUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          setCurrentUser({
            uid: loggedUser.uid,
            name: data.name ?? "Unknown",
            role: (data.role ?? "it-admin") as RoleSlug,
          });
        } else {
          setCurrentUser({
            uid: loggedUser.uid,
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

  /* ================================================================
     Real-time: sessions collection
  ================================================================ */
  useEffect(() => {
    const sessionsRef = collection(db, "sessions");
    const sessionsQuery = query(sessionsRef, orderBy("loginTime", "desc"));

    const unsubscribe = onSnapshot(
      sessionsQuery,
      (snapshot) => {
        const fetched: SessionRow[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            userId: data.userId ?? "",
            userName: data.userName ?? "Unknown",
            role: (data.role ?? "oic") as RoleSlug,
            device: data.device ?? "Unknown device",
            ipAddress: data.ipAddress ?? "—",
            loginTime: data.loginTime
              ? formatTime(data.loginTime.toDate())
              : formatTime(new Date()),
            lastActive: data.lastActive
              ? formatTime(data.lastActive.toDate())
              : "—",
            lastActiveMs: data.lastActive?.toMillis?.() ?? data.loginTime?.toMillis?.() ?? Date.now(),
            closed: data.active === false || data.revoked === true || Boolean(data.endedAt),
          };
        });
        setSessions(fetched);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching sessions:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  /* ================================================================
     Click-outside + Escape
  ================================================================ */

  /* ================================================================
     Revoke session
  ================================================================ */
  const handleRevoke = async (row: SessionRow) => {
    const confirm = window.confirm(
      `Revoke session for ${row.userName}?\n\nThis will immediately log the user out.`
    );

    if (!confirm) return;

    setRevoking(row.id);

    try {
      const sessionRef = doc(db, "sessions", row.id);
      await updateDoc(sessionRef, {
        revoked: true,
        revokedAt: serverTimestamp(),
        revokedBy: currentUser.uid,
        revokedByName: currentUser.name,
      });

      setRevoking(null);
    } catch (err) {
      console.error("Error revoking session:", err);
      alert((err as Error)?.message || "Failed to revoke session.");
      setRevoking(null);
    }
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
              <h1>Session Monitor</h1>
              <p>
                {new Date().toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>

          </header>

          <div className="session-content">
            {/* Warning banner */}
            <div className="session-warning">
              <AlertTriangle size={18} className="session-warning-icon" />
              <p className="session-warning-text">
                <em>
                  Revoking a session will immediately log the user out. Use
                  only when a security incident is suspected.
                </em>
              </p>
            </div>

            {/* Active Sessions */}
            <article className="card">
              <div className="card-header-static">
                <h2 className="card-title-static">Active Sessions</h2>
              </div>

              {loading ? (
                <div className="table-loading">
                  <RefreshCw size={20} className="spin" />
                  <p>Loading active sessions...</p>
                </div>
              ) : activeSessions.length === 0 ? (
                <div className="table-empty">
                  <p>No active sessions.</p>
                </div>
              ) : (
                <table className="session-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Device</th>
                      <th>IP address</th>
                      <th>Login time</th>
                      <th>Last active</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSessions.map((row) => (
                      <tr key={row.id}>
                        <td className="cell-user">{row.userName}</td>
                        <td>
                          <span
                            className={`session-role-pill ${
                              ROLE_BADGE_CLASS[row.role]
                            }`}
                          >
                            {ROLE_SHORT_LABELS[row.role]}
                          </span>
                        </td>
                        <td className="cell-device">{row.device}</td>
                        <td className="cell-ip">{row.ipAddress}</td>
                        <td className="cell-time">{row.loginTime}</td>
                        <td className="cell-time">{row.lastActive}</td>
                        <td>
                          <button
                            type="button"
                            className="btn-revoke"
                            onClick={() => handleRevoke(row)}
                            disabled={revoking === row.id}
                          >
                            {revoking === row.id ? "Revoking..." : "Revoke"}
                          </button>
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
    </div>
  );
}
