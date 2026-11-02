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
  limit,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./ITAdminHomepage.css";
import "./DataPrivacyLog.css";

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

type PrivacyLogRow = {
  id: string;
  timestamp: Timestamp | null;
  time: string;
  userName: string;
  action: string;
  recordType: string;
  recordId: string;
};

/* ------------------------------------------------------------------
   ROLE MAP
------------------------------------------------------------------ */

/* ------------------------------------------------------------------
   NAV
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
      { label: "Audit Log", icon: FileText, path: "/it-admin/audit-log" },
      { label: "Data Privacy Log", icon: Lock, path: "/it-admin/data-privacy", active: true },
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
      hour12: true,
    });
  } catch {
    return "—";
  }
};

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function DataPrivacyLog() {

  const [, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "it-admin",
  });

  const [logs, setLogs] = useState<PrivacyLogRow[]>([]);
  const [loading, setLoading] = useState(true);

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

  /* Real-time: privacyLogs collection */
  useEffect(() => {
    const privacyRef = collection(db, "privacyLogs");
    const privacyQuery = query(privacyRef, orderBy("timestamp", "desc"), limit(200));

    const unsubscribe = onSnapshot(
      privacyQuery,
      (snapshot) => {
        const fetched: PrivacyLogRow[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            timestamp: data.timestamp ?? null,
            time: formatTime(data.timestamp),
            userName: data.userName ?? "Unknown",
            action: data.action ?? "Viewed",
            recordType: data.recordType ?? "—",
            recordId: data.recordId ?? "—",
          };
        });
        setLogs(fetched);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching privacy logs:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

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
              <h1>Data Privacy Log</h1>
              <p>
                {new Date().toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>

          </header>

          <div className="privacy-content">
            <article className="card">
              <div className="card-header-static">
                <h2 className="card-title-static">PII access log</h2>
              </div>

              {loading ? (
                <div className="table-loading">
                  <RefreshCw size={20} className="spin" />
                  <p>Loading privacy logs...</p>
                </div>
              ) : logs.length === 0 ? (
                <div className="table-empty">
                  <p>No PII access events recorded yet.</p>
                </div>
              ) : (
                <table className="privacy-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>User</th>
                      <th>Action</th>
                      <th>Record type</th>
                      <th>Record ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((row) => (
                      <tr key={row.id}>
                        <td className="cell-time">{row.time}</td>
                        <td className="cell-user">{row.userName}</td>
                        <td className="cell-action">{row.action}</td>
                        <td className="cell-record-type">{row.recordType}</td>
                        <td className="cell-record-id">{row.recordId}</td>
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
