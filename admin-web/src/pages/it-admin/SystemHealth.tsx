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
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./ITAdminHomepage.css";
import "./SystemHealth.css";
import { recordChecks, runChecks, SERVICES } from "../../lib/systemMonitor";

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
  name: string;
  role: RoleSlug;
};

type ServiceRow = {
  id: string;
  service: string;
  status: "Online" | "Scheduled" | "Offline";
  avgResponse: string;
  lastChecked: string;
  order: number;
};

type PerfLogRow = {
  id: string;
  time: string;
  event: string;
  value: string;
  status: "Normal" | "Watch" | "Critical";
};

type ErrorLogRow = {
  id: string;
  time: string;
  severity: "Warning" | "Error" | "Critical";
  service: string;
  description: string;
  status: "Resolved" | "Open" | "Investigating";
};

/* ------------------------------------------------------------------
   ROLE MAP
------------------------------------------------------------------ */

/* ------------------------------------------------------------------
   NAVIGATION
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
      {
        label: "System Health",
        icon: Activity,
        path: "/it-admin/system-health",
        active: true,
      },
      {
        label: "Backup & Restore",
        icon: DatabaseBackup,
        path: "/it-admin/backup",
      },
    ],
  },
  {
    title: "Access Control",
    items: [
      { label: "User Management", icon: Users, path: "/it-admin/users" },
      {
        label: "Roles & Permissions",
        icon: ShieldCheck,
        path: "/it-admin/roles",
      },
      {
        label: "Session Monitor",
        icon: Monitor,
        path: "/it-admin/sessions",
      },
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
      {
        label: "Data Privacy Log",
        icon: Lock,
        path: "/it-admin/data-privacy",
      },
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

const formatTimestamp = (ts: Timestamp | null): string => {
  if (!ts) return "—";
  try {
    const date = ts.toDate();
    return formatTime(date);
  } catch {
    return "—";
  }
};

/** Shown until the first real check is saved (lib/systemMonitor.ts). */
const FALLBACK_SERVICES: Omit<ServiceRow, "lastChecked">[] = SERVICES.map((svc) => ({
  id: svc.id,
  service: svc.name,
  status: "Scheduled" as const,
  avgResponse: "Not checked yet",
  order: svc.order,
}));

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function SystemHealth() {

  const [, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "it-admin",
  });

  const [services, setServices] = useState<ServiceRow[]>([]);
  const [perfLogs, setPerfLogs] = useState<PerfLogRow[]>([]);
  const [errorLogs, setErrorLogs] = useState<ErrorLogRow[]>([]);

  const [servicesLoading, setServicesLoading] = useState(true);
  const [perfLoading, setPerfLoading] = useState(true);
  const [errorsLoading, setErrorsLoading] = useState(true);

  const [refreshing, setRefreshing] = useState<string | null>(null);

  /* Fetch current authenticated user */
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

  /* Real-time listener: systemHealth */
  useEffect(() => {
    const statusRef = collection(db, "systemHealth");
    const statusQuery = query(statusRef, orderBy("order", "asc"));

    const unsubscribe = onSnapshot(
      statusQuery,
      (snapshot) => {
        if (snapshot.empty) {
          const now = new Date();
          setServices(
            FALLBACK_SERVICES.map((s) => ({
              ...s,
              lastChecked: formatTime(now),
            }))
          );
        } else {
          const fetched: ServiceRow[] = snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              service: data.name ?? "Unknown Service",
              status: (data.status ?? "Online") as
                | "Online"
                | "Scheduled"
                | "Offline",
              avgResponse: data.avgResponse ?? "—",
              lastChecked: formatTimestamp(data.lastChecked),
              order: data.order ?? 999,
            };
          });
          setServices(fetched);
        }
        setServicesLoading(false);
      },
      (error) => {
        console.error("Error fetching systemHealth:", error);
        const now = new Date();
        setServices(
          FALLBACK_SERVICES.map((s) => ({
            ...s,
            lastChecked: formatTime(now),
          }))
        );
        setServicesLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  /* Real-time listener: performanceLogs */
  useEffect(() => {
    const perfRef = collection(db, "performanceLogs");
    const perfQuery = query(perfRef, orderBy("timestamp", "desc"), limit(20));

    const unsubscribe = onSnapshot(
      perfQuery,
      (snapshot) => {
        const fetched: PerfLogRow[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            time: formatTimestamp(data.timestamp),
            event: data.event ?? "Unknown event",
            value: data.value ?? "—",
            status: (data.status ?? "Normal") as
              | "Normal"
              | "Watch"
              | "Critical",
          };
        });
        setPerfLogs(fetched);
        setPerfLoading(false);
      },
      (error) => {
        console.error("Error fetching performanceLogs:", error);
        setPerfLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  /* Real-time listener: errorLogs */
  useEffect(() => {
    const errRef = collection(db, "errorLogs");
    const errQuery = query(errRef, orderBy("timestamp", "desc"), limit(20));

    const unsubscribe = onSnapshot(
      errQuery,
      (snapshot) => {
        const fetched: ErrorLogRow[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            time: formatTimestamp(data.timestamp),
            severity: (data.severity ?? "Warning") as
              | "Warning"
              | "Error"
              | "Critical",
            service: data.service ?? "Unknown",
            description: data.description ?? "",
            status: (data.status ?? "Resolved") as
              | "Resolved"
              | "Open"
              | "Investigating",
          };
        });
        setErrorLogs(fetched);
        setErrorsLoading(false);
      },
      (error) => {
        console.error("Error fetching errorLogs:", error);
        setErrorsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  /** Runs a real check now and saves it (updates every row). */
  const handleRefresh = async (serviceId: string) => {
    setRefreshing(serviceId);
    try {
      const results = await runChecks();
      await recordChecks(results, true);
      const now = formatTime(new Date());
      setServices((prev) =>
        prev.map((row) => {
          const r = results.find((x) => x.id === row.id);
          return r
            ? {
                ...row,
                status: r.ok ? "Online" : "Offline",
                avgResponse: r.ok ? `${r.ms} ms` : "—",
                lastChecked: now,
              }
            : row;
        })
      );
    } finally {
      setRefreshing(null);
    }
  };

  /** IT Admin marks an error as fixed. */
  const handleResolve = async (logId: string) => {
    try {
      await updateDoc(doc(db, "errorLogs", logId), {
        status: "Resolved",
        resolvedAt: serverTimestamp(),
        resolvedBy: auth.currentUser?.uid ?? "",
      });
    } catch (err) {
      console.warn("Could not mark the error resolved:", err);
    }
  };

  return (
    <div className="it-admin-page">
      <div className="dashboard">
        {/* Sidebar */}
        <AppSidebar groups={navGroups} role={<>IT Admin</>} />

        {/* Main content */}
        <main className="main">
          <AppTopbar groups={navGroups} />
          <header className="main-header">
            <div>
              <h1>System Health</h1>
              <p>
                {new Date().toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>

          </header>

          <div className="system-health-content">
            {/* Service Health */}
            <article className="card">
              <div className="card-header-static">
                <span className="eyebrow live">Live</span>
                <h2 className="card-title-static">Service Health</h2>
              </div>

              {servicesLoading ? (
                <div className="table-loading">
                  <RefreshCw size={20} className="spin" />
                  <p>Loading services...</p>
                </div>
              ) : (
                <table className="health-table">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Status</th>
                      <th>Avg response</th>
                      <th>Last checked</th>
                      <th aria-label="Actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s) => (
                      <tr key={s.id}>
                        <td className="cell-service">{s.service}</td>
                        <td>
                          <span
                            className={`health-pill ${
                              s.status === "Online"
                                ? "pill-online"
                                : s.status === "Scheduled"
                                ? "pill-scheduled"
                                : "pill-offline"
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>
                        <td className="cell-response">{s.avgResponse}</td>
                        <td className="cell-last-checked">{s.lastChecked}</td>
                        <td className="cell-refresh">
                          <button
                            type="button"
                            className="refresh-btn"
                            onClick={() => handleRefresh(s.id)}
                            disabled={refreshing === s.id}
                            aria-label={`Refresh ${s.service}`}
                          >
                            <RefreshCw
                              size={16}
                              className={refreshing === s.id ? "spin" : ""}
                            />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </article>

            {/* Performance Log */}
            <article className="card">
              <div className="card-header-static">
                <span className="eyebrow">Slow or failed checks · page load times</span>
                <h2 className="card-title-static">Performance Log</h2>
              </div>

              {perfLoading ? (
                <div className="table-loading">
                  <RefreshCw size={20} className="spin" />
                  <p>Loading performance logs...</p>
                </div>
              ) : perfLogs.length === 0 ? (
                <div className="table-empty">
                  <p>No performance logs recorded today.</p>
                </div>
              ) : (
                <table className="health-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Event</th>
                      <th>Value</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perfLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="cell-time">{log.time}</td>
                        <td className="cell-event">{log.event}</td>
                        <td className="cell-value">{log.value}</td>
                        <td>
                          <span
                            className={`health-pill ${
                              log.status === "Normal"
                                ? "pill-normal"
                                : log.status === "Watch"
                                ? "pill-watch"
                                : "pill-critical"
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </article>

            {/* Error & Crash Log */}
            <article className="card">
              <div className="card-header-static">
                <span className="eyebrow">Latest 20</span>
                <h2 className="card-title-static">Error &amp; Crash Log</h2>
              </div>

              {errorsLoading ? (
                <div className="table-loading">
                  <RefreshCw size={20} className="spin" />
                  <p>Loading error logs...</p>
                </div>
              ) : errorLogs.length === 0 ? (
                <div className="table-empty">
                  <p>No errors reported in the last 24 hours.</p>
                </div>
              ) : (
                <table className="health-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Severity</th>
                      <th>Service</th>
                      <th>Description</th>
                      <th>Status</th>
                      <th aria-label="Actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="cell-time">{log.time}</td>
                        <td>
                          <span
                            className={`health-pill ${
                              log.severity === "Warning"
                                ? "pill-warning"
                                : log.severity === "Error"
                                ? "pill-error"
                                : "pill-critical"
                            }`}
                          >
                            {log.severity}
                          </span>
                        </td>
                        <td className="cell-service-name">{log.service}</td>
                        <td className="cell-description">{log.description}</td>
                        <td>
                          <span
                            className={`health-pill ${
                              log.status === "Resolved"
                                ? "pill-resolved"
                                : log.status === "Open"
                                ? "pill-error"
                                : "pill-watch"
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="cell-refresh">
                          {log.status !== "Resolved" && (
                            <button
                              type="button"
                              className="resolve-btn"
                              onClick={() => void handleResolve(log.id)}
                              aria-label={`Mark error at ${log.time} as resolved`}
                            >
                              Mark resolved
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
    </div>
  );
}
