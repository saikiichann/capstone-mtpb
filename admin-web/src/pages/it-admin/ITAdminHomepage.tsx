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
  Wifi,
  WifiOff,
  QrCode,
} from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { Link } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  getCountFromServer,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  limit,
  where,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import { supabase, SUPABASE_BUCKET } from "../../supabase";
import { recordChecks, runChecks, SERVICES } from "../../lib/systemMonitor";
import "./ITAdminHomepage.css";

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

type ServiceStatus = {
  id: string;
  name: string;
  status: string;
  tone: "online" | "scheduled" | "offline";
  latency?: number;
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

type AuditEvent = {
  id: string;
  userName: string;
  action: string;
  timestamp: Timestamp | null;
};

type Metrics = {
  totalAccounts: number;
  activeAccounts: number;
  auditEventsToday: number;
  errorEvents: number;
  failedLogins: number;
};

/* ------------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------------ */
// Supabase Free tier storage limit: 1 GB
const SUPABASE_FREE_TIER_BYTES = 1024 * 1024 * 1024;

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
      { label: "Overview", icon: LayoutDashboard, path: "/it-admin", active: true },
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
const formatRelativeTime = (ts: Timestamp | null): string => {
  if (!ts) return "just now";
  const date = ts.toDate();
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
};

const isToday = (ts: Timestamp | null): boolean => {
  if (!ts) return false;
  const date = ts.toDate();
  const now = new Date();
  return date.toDateString() === now.toDateString();
};

// Format bytes into a human-readable string (B, KB, MB, GB, TB)
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

/* ------------------------------------------------------------------
   HEALTH CHECK FUNCTIONS
------------------------------------------------------------------ */

// Retrieve total storage usage by summing the size of all files in the bucket.
const getStorageUsage = async (): Promise<{
  ok: boolean;
  bytes: number;
  fileCount: number;
  latency: number;
}> => {
  const start = performance.now();
  try {
    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .list("", {
        limit: 1000,
        sortBy: { column: "name", order: "asc" },
      });

    const latency = Math.round(performance.now() - start);

    if (error) {
      console.warn("Storage usage fetch warning:", error.message);
      return { ok: false, bytes: 0, fileCount: 0, latency };
    }

    // Profile photos (enforcer app) are in the "profiles" folder.
    const { data: profileFiles } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .list("profiles", { limit: 1000 });
    const files = [...(data ?? []), ...(profileFiles ?? [])].filter(
      (file) => (file.metadata as { size?: number } | null)?.size !== undefined
    );
    const totalBytes = files.reduce((sum, file) => {
      const size = (file.metadata as { size?: number } | null)?.size ?? 0;
      return sum + size;
    }, 0);

    return {
      ok: true,
      bytes: totalBytes,
      fileCount: files.length,
      latency,
    };
  } catch (err) {
    console.error("Storage usage fetch failed:", err);
    return { ok: false, bytes: 0, fileCount: 0, latency: 0 };
  }
};

/* ------------------------------------------------------------------
   DEFAULT SYSTEM STATUS (fallback)
------------------------------------------------------------------ */
function getDefaultSystemStatus(): ServiceStatus[] {
  return [
    ...SERVICES.map((s) => ({
      id: s.id,
      name: s.name,
      status: "Checking…",
      tone: "scheduled" as const,
    })),
    { id: "backup", name: "Backup Service", status: "Checking…", tone: "scheduled" },
  ];
}

/** Bars for the "Database records" card. */
type RecordCount = { label: string; count: number };
const RECORD_COLLECTIONS: { id: string; label: string }[] = [
  { id: "violations", label: "Violations" },
  { id: "payments", label: "Payments" },
  { id: "impoundRecords", label: "Impound records" },
  { id: "auditLogs", label: "Audit log entries" },
  { id: "users", label: "Staff accounts" },
];

const isLocalhost = () => /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function ITAdminHomePage() {

  const [, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "it-admin",
  });

  const [metrics, setMetrics] = useState<Metrics>({
    totalAccounts: 0,
    activeAccounts: 0,
    auditEventsToday: 0,
    errorEvents: 0,
    failedLogins: 0,
  });

  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);

  const [systemStatus, setSystemStatus] = useState<ServiceStatus[]>(
    getDefaultSystemStatus()
  );

  const [isOnline, setIsOnline] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  /** Uptime from the recorded health checks (healthChecks, last 30 days). */
  const [uptime, setUptime] = useState({ value: "—", sub: "No checks recorded yet" });
  const [records, setRecords] = useState<RecordCount[]>([]);

  // Storage usage state
  const [storageUsed, setStorageUsed] = useState("—");
  const [storageUsedBytes, setStorageUsedBytes] = useState(0);
  const [storageFileCount, setStorageFileCount] = useState(0);

  // Tracks whether the initial auth state has resolved.
  // Prevents false "offline" results on first render.
  const [authReady, setAuthReady] = useState(false);

  /* ================================================================
     1. BROWSER ONLINE/OFFLINE
  ================================================================ */
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  /* ================================================================
     2. CURRENT USER
  ================================================================ */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      // Mark auth as ready after the first callback resolves.
      setAuthReady(true);

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

  /* ================================================================
     3. LIVE HEALTH CHECKS (every 30s)
     Waits for authReady before starting to avoid false negatives.
  ================================================================ */
  useEffect(() => {
    if (!authReady) return;

    let isMounted = true;

    const runHealthChecks = async () => {
      // Real checks (lib/systemMonitor.ts). Saved at most every 5 minutes.
      const results = await runChecks();
      void recordChecks(results);

      if (!isMounted) return;

      // Fetch storage usage in parallel with status checks.
      const storageUsage = await getStorageUsage();
      if (!isMounted) return;

      if (storageUsage.ok) {
        setStorageUsedBytes(storageUsage.bytes);
        setStorageFileCount(storageUsage.fileCount);

        const percent = Math.min(
          100,
          Math.round((storageUsage.bytes / SUPABASE_FREE_TIER_BYTES) * 100)
        );
        setStorageUsed(`${percent}%`);
      }

      // Backup: the latest entry in Backup History, if any.
      let backupStatus = "Not set up";
      try {
        const recent = await getDocs(
          query(collection(db, "backupHistory"), orderBy("timestamp", "desc"), limit(10))
        );
        const lastBackup = recent.docs.find((d) => d.data().type === "Manual backup");
        const ts = lastBackup?.data().timestamp as Timestamp | undefined;
        if (ts) backupStatus = `Last ${ts.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      } catch {
        // can't read it: shown as not set up
      }

      if (!isMounted) return;

      const updatedStatuses: ServiceStatus[] = [
        ...results.map((r) => {
          const localApi = r.id === "api" && isLocalhost();
          return {
            id: r.id,
            name: r.name,
            status: localApi ? "Live site only" : r.ok ? "Online" : "Offline",
            tone: (localApi ? "scheduled" : r.ok ? "online" : "offline") as ServiceStatus["tone"],
            latency: r.ms,
          };
        }),
        {
          id: "backup",
          name: "Backup Service",
          status: backupStatus,
          tone: backupStatus.startsWith("Last") ? "online" : "scheduled",
        },
      ];

      setSystemStatus(updatedStatuses);
      setLastUpdate(new Date());

    };

    runHealthChecks();
    const intervalId = setInterval(runHealthChecks, 30000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [authReady]);

  /* ================================================================
     3b. UPTIME — share of recorded health checks that passed
  ================================================================ */
  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      const from = new Date(Date.now() - 29 * 86400000);
      const pad = (n: number) => String(n).padStart(2, "0");
      const fromKey = `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`;
      try {
        const snap = await getDocs(
          query(collection(db, "healthChecks"), where("date", ">=", fromKey))
        );
        let checks = 0;
        let ok = 0;
        snap.docs.forEach((d) => {
          checks += Number(d.data().checks ?? 0);
          ok += Number(d.data().okChecks ?? 0);
        });
        if (!isMounted) return;
        setUptime(
          checks === 0
            ? { value: "—", sub: "No checks recorded yet" }
            : {
                value: `${((ok / checks) * 100).toFixed(ok === checks ? 0 : 1)}%`,
                sub: `Last 30 days · ${checks.toLocaleString("en-US")} checks`,
              }
        );
      } catch (err) {
        console.warn("Uptime not loaded:", err);
      }
    };
    void load();
    // Again shortly after opening, so this visit's own check is included.
    const first = setTimeout(load, 15000);
    const id = setInterval(load, 5 * 60 * 1000);
    return () => {
      isMounted = false;
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  /* ================================================================
     3c. DATABASE RECORDS — real counts from Firestore
  ================================================================ */
  useEffect(() => {
    let isMounted = true;
    void Promise.all(
      RECORD_COLLECTIONS.map(async (c) => {
        try {
          const snap = await getCountFromServer(collection(db, c.id));
          return { label: c.label, count: snap.data().count };
        } catch {
          return { label: c.label, count: -1 };
        }
      })
    ).then((rows) => {
      if (isMounted) setRecords(rows);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  /* ================================================================
     3d. ERROR EVENTS — errorLogs in the last 24 hours
  ================================================================ */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, "errorLogs"), orderBy("timestamp", "desc"), limit(100)),
      (snapshot) => {
        const since = Date.now() - 86400000;
        const count = snapshot.docs.filter((d) => {
          const ts = d.data().timestamp as Timestamp | undefined;
          return ts && ts.toMillis() >= since;
        }).length;
        setMetrics((prev) => ({ ...prev, errorEvents: count }));
      },
      (error) => console.warn("Error log count not loaded:", error)
    );
    return () => unsubscribe();
  }, []);

  /* ================================================================
     4. USERS (real-time)
  ================================================================ */
  useEffect(() => {
    const usersRef = collection(db, "users");
    const unsubscribe = onSnapshot(
      usersRef,
      (snapshot) => {
        const allUsers = snapshot.docs.map((d) => d.data());
        const activeCount = allUsers.filter((u) => u.status === "active").length;
        setMetrics((prev) => ({
          ...prev,
          totalAccounts: allUsers.length,
          activeAccounts: activeCount,
        }));
      },
      (error) => {
        console.error("Error fetching users:", error);
      }
    );
    return () => unsubscribe();
  }, []);

  /* ================================================================
     5. AUDIT LOGS (real-time)
  ================================================================ */
  useEffect(() => {
    const auditRef = collection(db, "auditLogs");
    const auditQuery = query(auditRef, orderBy("timestamp", "desc"), limit(50));

    const unsubscribe = onSnapshot(
      auditQuery,
      (snapshot) => {
        const allEvents: AuditEvent[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            userName: data.userName ?? "Unknown",
            action: data.action ?? "",
            timestamp: data.timestamp ?? null,
          };
        });

        setAuditEvents(allEvents.slice(0, 4));

        const todayEvents = allEvents.filter((e) => isToday(e.timestamp));

        setMetrics((prev) => ({
          ...prev,
          auditEventsToday: todayEvents.length,
        }));
      },
      (error) => {
        console.error("Error fetching audit logs:", error);
        setAuditEvents([]);
      }
    );
    return () => unsubscribe();
  }, []);

  /* ================================================================
     6. CLICK-OUTSIDE AND ESCAPE HANDLERS
  ================================================================ */

  const metricCards = [
    { label: "System Uptime", value: uptime.value, sub: uptime.sub },
    {
      label: "Storage Used",
      value: storageUsed,
      sub:
        storageUsedBytes > 0
          ? `${formatBytes(storageUsedBytes)} · ${storageFileCount} files`
          : "Supabase Storage",
    },
    {
      label: "Active Accounts",
      value: String(metrics.activeAccounts),
      sub: `of ${metrics.totalAccounts} total`,
    },
    {
      label: "Audit Events Today",
      value: String(metrics.auditEventsToday),
      sub: "System-wide",
    },
    {
      label: "Error Events",
      value: String(metrics.errorEvents),
      sub: "Last 24 hrs · System Health",
    },
    {
      // A failed login has no signed-in user, so the browser can't save it.
      // It needs the login server (same as Forgot password), not set up yet.
      label: "Failed Logins",
      value: "—",
      sub: "Not recorded yet",
    },
  ];

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
              <h1>Overview</h1>
              <p>
                {new Date().toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>

            <div className="header-right">
              <div
                className={`connection-indicator ${isOnline ? "online" : "offline"}`}
                title={isOnline ? "Real-time updates active" : "Offline"}
              >
                {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
                <span>{isOnline ? "Live" : "Offline"}</span>
              </div>

            </div>
          </header>

          <div className="main-content">
            {/* METRICS */}
            <section className="metric-grid">
              {metricCards.map((card) => (
                <article className="card metric-card" key={card.label}>
                  <p className="metric-label">{card.label}</p>
                  <p className="metric-value">{card.value}</p>
                  <p className="metric-sub">{card.sub}</p>
                </article>
              ))}
            </section>

            {/* MIDDLE ROW */}
            <section className="middle-row">
              {/* LIVE SYSTEM STATUS */}
              <article className="card">
                <div className="card-header">
                  <div className="card-heading">
                    <span className="eyebrow live">Live</span>
                    <h2 className="card-title">System Status</h2>
                  </div>
                  <Link to="/it-admin/system-health" className="card-link">
                    Full Status
                  </Link>
                </div>

                <ul className="status-list">
                  {systemStatus.map((service) => (
                    <li className="status-row" key={service.id}>
                      <span className="status-name">
                        {service.name}
                        {service.latency !== undefined && service.latency > 0 && (
                          <span className="latency-badge">{service.latency}ms</span>
                        )}
                      </span>
                      <span className="status-actions">
                        <span className={`status-pill ${service.tone}`}>
                          {service.status}
                        </span>
                        <button
                          type="button"
                          className="row-more"
                          aria-label={`More options for ${service.name}`}
                        >
                          &#8943;
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="status-footer">
                  <span>
                    Last checked:{" "}
                    {lastUpdate.toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                  <span className="status-footer-live">Auto-refresh every 30s</span>
                </div>
              </article>

              {/* AUDIT EVENTS */}
              <article className="card">
                <div className="card-header">
                  <div className="card-heading">
                    <span className="eyebrow">Recent</span>
                    <h2 className="card-title">Audit Events</h2>
                  </div>
                  <Link to="/it-admin/audit-log" className="card-link">
                    Full Log
                  </Link>
                </div>

                <ul className="activity-list">
                  {auditEvents.length === 0 ? (
                    <li className="activity-item">
                      <p className="activity-text">No recent activity</p>
                    </li>
                  ) : (
                    auditEvents.map((event) => (
                      <li className="activity-item" key={event.id}>
                        <p className="activity-text">
                          {event.userName} — {event.action}
                        </p>
                        <p className="activity-time">
                          {formatRelativeTime(event.timestamp)}
                        </p>
                      </li>
                    ))
                  )}
                </ul>
              </article>
            </section>

            {/* BOTTOM ROW — real numbers. The system is serverless (Vercel +
                Firebase + Supabase), so there is no server RAM or disk to
                show; these are the resources it actually uses. */}
            <section className="bottom-row">
              <article className="card">
                <h2 className="card-title">Database records</h2>
                <div className="usage-list">
                  {records.length === 0 ? (
                    <p className="usage-note">Counting records…</p>
                  ) : (
                    records.map((row) => {
                      const max = Math.max(1, ...records.map((r) => r.count));
                      return (
                        <div className="usage-row" key={row.label}>
                          <div className="usage-meta">
                            <span className="usage-label">{row.label}</span>
                            <span className="usage-value">
                              {row.count < 0 ? "—" : row.count.toLocaleString("en-US")}
                            </span>
                          </div>
                          <div className="progress-track">
                            <div
                              className="progress-fill blue"
                              style={{ width: `${row.count < 0 ? 0 : Math.max(2, Math.round((row.count / max) * 100))}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="usage-footer">
                  <span>Cloud Firestore</span>
                  <span className="usage-note">Counted live from the database</span>
                </div>
              </article>

              <article className="card">
                <h2 className="card-title">Photo storage — Supabase (1 GB free plan)</h2>
                <div className="usage-list">
                  {[
                    {
                      label: "Used",
                      value: formatBytes(storageUsedBytes),
                      percent: Math.min(100, (storageUsedBytes / SUPABASE_FREE_TIER_BYTES) * 100),
                      tone: "blue",
                    },
                    {
                      label: "Free",
                      value: formatBytes(Math.max(0, SUPABASE_FREE_TIER_BYTES - storageUsedBytes)),
                      percent: Math.max(0, 100 - (storageUsedBytes / SUPABASE_FREE_TIER_BYTES) * 100),
                      tone: "green",
                    },
                  ].map((bar) => (
                    <div className="usage-row" key={bar.label}>
                      <div className="usage-meta">
                        <span className="usage-label">{bar.label}</span>
                        <span className="usage-value">{bar.value}</span>
                      </div>
                      <div className="progress-track">
                        <div
                          className={`progress-fill ${bar.tone}`}
                          style={{ width: `${Math.max(bar.percent > 0 ? 1 : 0, Math.round(bar.percent))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="usage-footer">
                  <span>{storageFileCount.toLocaleString("en-US")} photos</span>
                  <span className="usage-note">Evidence and profile photos</span>
                </div>
              </article>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
