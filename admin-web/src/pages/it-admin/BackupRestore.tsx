/* ------------------------------------------------------------------
   IT ADMIN — Backup & Restore (/it-admin/backup)

   Totoong backup at restore (lib/backup.ts):
   - "Back up now": lahat ng records → isang JSON file na dina-download,
     nire-record sa Backup History at sa Audit Log.
   - "Restore from a backup file": ibinabalik lang ang mga record na
     nawala; hindi pinapatungan ang mga nandiyan pa.
   Walang automatic na gabi-gabing backup: kailangan iyon ng Firebase
   Blaze plan (may bayad). Inirerekomenda: mag-back up lingguhan.
------------------------------------------------------------------ */
import { useEffect, useRef, useState, type ChangeEvent } from "react";
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
  Loader2,
  RefreshCw,
  Download,
  RotateCcw,
  AlertTriangle,
  QrCode,
  Upload,
  ShieldAlert,
} from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./ITAdminHomepage.css";
import "./BackupRestore.css";

import AppTopbar from "../../components/AppTopbar";
import AppSidebar from "../../components/AppSidebar";
import { clientIp } from "../../lib/staffSession";
import {
  BACKUP_COLLECTIONS,
  backupFileName,
  createBackup,
  downloadBackup,
  formatBytes,
  parseBackup,
  planRestore,
  restoreMissing,
  type BackupFile,
  type CollectionCount,
  type RestorePlan,
} from "../../lib/backup";

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

type HistoryRow = {
  id: string;
  timestamp: Timestamp | null;
  type: string;
  records: number;
  size: string;
  by: string;
  status: "Success" | "Partial" | "Failed";
  note: string;
};

type Progress = { label: string; done: number; total: number } | null;

/** Remind the IT Admin when the last backup is older than this. */
const STALE_DAYS = 7;

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
      { label: "System Health", icon: Activity, path: "/it-admin/system-health" },
      { label: "Backup & Restore", icon: DatabaseBackup, path: "/it-admin/backup", active: true },
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
const formatDate = (ts: Timestamp | null): string => {
  if (!ts) return "—";
  try {
    const date = ts.toDate();
    return (
      date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
      ", " +
      date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    );
  } catch {
    return "—";
  }
};

const percent = (p: Progress) => (p && p.total ? Math.round((p.done / p.total) * 100) : 0);

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function BackupRestore() {
  const [userName, setUserName] = useState("IT Admin");
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Back up now
  const [backingUp, setBackingUp] = useState(false);
  const [backupProgress, setBackupProgress] = useState<Progress>(null);
  const [backupResult, setBackupResult] = useState<{ counts: CollectionCount[]; size: number; name: string } | null>(null);
  const [backupError, setBackupError] = useState("");

  // Restore
  const fileInput = useRef<HTMLInputElement>(null);
  const [restoreFile, setRestoreFile] = useState<{ name: string; file: BackupFile } | null>(null);
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<Progress>(null);
  const [restoring, setRestoring] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [restoreError, setRestoreError] = useState("");
  const [restoreDone, setRestoreDone] = useState<{ total: number; failed: string[] } | null>(null);

  /* Current user (name for the history) */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) return;
      try {
        const snap = await getDoc(doc(db, "users", loggedUser.uid));
        setUserName(String(snap.data()?.name ?? loggedUser.email?.split("@")[0] ?? "IT Admin"));
      } catch {
        // keep the default
      }
    });
    return () => unsubscribe();
  }, []);

  /* Backup History (live) */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, "backupHistory"), orderBy("timestamp", "desc"), limit(50)),
      (snapshot) => {
        setHistory(
          snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              timestamp: (data.timestamp as Timestamp) ?? null,
              type: String(data.type ?? "Backup"),
              records: Number(data.totalRecords ?? 0),
              size: data.sizeBytes ? formatBytes(Number(data.sizeBytes)) : "—",
              by: String(data.byName ?? "—"),
              status: (data.status ?? "Success") as HistoryRow["status"],
              note: String(data.note ?? ""),
            };
          })
        );
        setHistoryLoading(false);
      },
      (error) => {
        console.error("Error fetching backup history:", error);
        setHistoryLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  /** When the page opened (for "last backup was N days ago"). */
  const [openedAt] = useState(() => Date.now());
  const lastBackup = history.find((h) => h.type === "Manual backup" && h.status !== "Failed");
  const daysSince = lastBackup?.timestamp
    ? Math.max(0, Math.floor((openedAt - lastBackup.timestamp.toMillis()) / 86400000))
    : null;

  const writeAudit = async (action: string, metadata: Record<string, unknown>) => {
    try {
      await addDoc(collection(db, "auditLogs"), {
        userName,
        userRole: "it-admin",
        action,
        record: "backup",
        type: "system",
        metadata,
        timestamp: serverTimestamp(),
        ipAddress: clientIp(),
      });
    } catch (err) {
      console.warn("Audit log not written:", err);
    }
  };

  /* ---------------- Back up now ---------------- */
  const handleBackup = async () => {
    setBackingUp(true);
    setBackupError("");
    setBackupResult(null);
    try {
      const { file, counts } = await createBackup(userName, (label, done, total) =>
        setBackupProgress({ label, done, total })
      );
      const name = backupFileName();
      const size = downloadBackup(file, name);
      const total = counts.reduce((n, c) => n + c.count, 0);
      const failed = counts.filter((c) => c.error);
      await addDoc(collection(db, "backupHistory"), {
        timestamp: serverTimestamp(),
        type: "Manual backup",
        status: failed.length ? "Partial" : "Success",
        totalRecords: total,
        sizeBytes: size,
        fileName: name,
        counts: Object.fromEntries(counts.map((c) => [c.id, c.count])),
        note: failed.length ? `Not readable: ${failed.map((c) => c.label).join(", ")}` : "",
        byUid: auth.currentUser?.uid ?? "",
        byName: userName,
      });
      await writeAudit(`downloaded a full backup (${total} records)`, { fileName: name, totalRecords: total });
      setBackupResult({ counts, size, name });
    } catch (err) {
      console.error("Backup failed:", err);
      setBackupError("The backup could not be made. Check your connection and try again.");
    } finally {
      setBackingUp(false);
      setBackupProgress(null);
    }
  };

  /* ---------------- Restore ---------------- */
  const resetRestore = () => {
    setRestoreFile(null);
    setPlan(null);
    setConfirmText("");
    setRestoreError("");
    setRestoreDone(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const handlePickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    setRestoreError("");
    setRestoreDone(null);
    setPlan(null);
    setConfirmText("");
    if (!picked) return;
    try {
      const file = parseBackup(await picked.text());
      setRestoreFile({ name: picked.name, file });
      setPlanning(true);
      const p = await planRestore(file, (label, done, total) => setRestoreProgress({ label, done, total }));
      setPlan(p);
    } catch (err) {
      setRestoreFile(null);
      setRestoreError((err as Error).message || "This file could not be read.");
    } finally {
      setPlanning(false);
      setRestoreProgress(null);
    }
  };

  const missingTotal = plan?.reduce((n, p) => n + p.missing.length, 0) ?? 0;

  const handleRestore = async () => {
    if (!plan || !restoreFile || confirmText.trim().toUpperCase() !== "RESTORE") return;
    setRestoring(true);
    setRestoreError("");
    try {
      const { restored, failed } = await restoreMissing(plan, (label, done, total) =>
        setRestoreProgress({ label, done, total })
      );
      const total = Object.values(restored).reduce((n, c) => n + c, 0);
      const failedLabels = Object.keys(failed).map(
        (id) => BACKUP_COLLECTIONS.find((c) => c.id === id)?.label ?? id
      );
      await addDoc(collection(db, "backupHistory"), {
        timestamp: serverTimestamp(),
        type: "Restore",
        status: failedLabels.length ? (total ? "Partial" : "Failed") : "Success",
        totalRecords: total,
        sizeBytes: 0,
        fileName: restoreFile.name,
        counts: restored,
        note: `From backup of ${new Date(restoreFile.file.createdAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}${failedLabels.length ? ` · Not restored: ${failedLabels.join(", ")}` : ""}`,
        byUid: auth.currentUser?.uid ?? "",
        byName: userName,
      });
      await writeAudit(`restored ${total} missing records from a backup`, {
        fileName: restoreFile.name,
        backupCreatedAt: restoreFile.file.createdAt,
        restored,
        failed,
      });
      setRestoreDone({ total, failed: failedLabels });
      setPlan(null);
      setConfirmText("");
    } catch (err) {
      console.error("Restore failed:", err);
      setRestoreError("The restore stopped. Nothing that was already in the database was changed.");
    } finally {
      setRestoring(false);
      setRestoreProgress(null);
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
              <h1>Backup &amp; Restore</h1>
              <p>
                {new Date().toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </header>

          <div className="backup-content">
            {/* STALE REMINDER */}
            {!historyLoading && (daysSince === null || daysSince >= STALE_DAYS) && (
              <div className="backup-alert" role="status">
                <AlertTriangle size={18} aria-hidden="true" />
                <span>
                  {daysSince === null
                    ? "No backup has been made yet. Make one now and keep the file somewhere safe."
                    : `The last backup was ${daysSince} days ago. A weekly backup is recommended.`}
                </span>
              </div>
            )}

            <section className="backup-grid">
              {/* BACK UP NOW */}
              <article className="card backup-card">
                <div className="card-header-static">
                  <span className="eyebrow">Manual backup</span>
                  <h2 className="card-title-static">Back up now</h2>
                </div>
                <p className="backup-text">
                  Saves every record in the system ({BACKUP_COLLECTIONS.length} collections: violations,
                  payments, impound records, staff accounts, logs and settings) into one file on this
                  computer, with all dates kept.
                </p>
                <p className="backup-last">
                  Last backup:{" "}
                  <strong>
                    {lastBackup ? `${formatDate(lastBackup.timestamp)} · ${lastBackup.records.toLocaleString("en-US")} records` : "none yet"}
                  </strong>
                </p>

                {backingUp && backupProgress && (
                  <div className="backup-progress" aria-live="polite">
                    <div className="backup-progress-bar">
                      <span style={{ width: `${percent(backupProgress)}%` }} />
                    </div>
                    <span>Reading {backupProgress.label}…</span>
                  </div>
                )}

                {backupResult && (
                  <div className="backup-success" role="status">
                    <strong>Backup saved: {backupResult.name}</strong>
                    <span>
                      {backupResult.counts.reduce((n, c) => n + c.count, 0).toLocaleString("en-US")} records ·{" "}
                      {formatBytes(backupResult.size)}
                    </span>
                    {backupResult.counts.some((c) => c.error) && (
                      <span className="backup-warn">
                        Not readable: {backupResult.counts.filter((c) => c.error).map((c) => c.label).join(", ")}
                      </span>
                    )}
                  </div>
                )}
                {backupError && <p className="backup-error">{backupError}</p>}

                <div className="backup-privacy">
                  <ShieldAlert size={16} aria-hidden="true" />
                  <span>
                    The file has personal information (names, plates, contact details). Keep it on an
                    MTPB computer or drive only, and delete old copies you no longer need.
                  </span>
                </div>

                <button type="button" className="btn-backup" onClick={handleBackup} disabled={backingUp || restoring}>
                  {backingUp ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
                  {backingUp ? "Backing up…" : "Back up now"}
                </button>
              </article>

              {/* RESTORE */}
              <article className="card backup-card">
                <div className="card-header-static">
                  <span className="eyebrow">Recovery</span>
                  <h2 className="card-title-static">Restore from a backup file</h2>
                </div>
                <p className="backup-text">
                  Puts back records that were <strong>deleted or lost</strong>. Records that are still in
                  the system are never replaced, so newer payments and tickets stay as they are.
                </p>

                <input
                  ref={fileInput}
                  id="restore-file"
                  type="file"
                  accept="application/json,.json"
                  className="visually-hidden"
                  onChange={handlePickFile}
                  disabled={planning || restoring}
                />
                {!restoreFile && (
                  <label htmlFor="restore-file" className="btn-choose-file">
                    <Upload size={16} aria-hidden="true" />
                    Choose backup file (.json)
                  </label>
                )}

                {planning && restoreProgress && (
                  <div className="backup-progress" aria-live="polite">
                    <div className="backup-progress-bar">
                      <span style={{ width: `${percent(restoreProgress)}%` }} />
                    </div>
                    <span>Comparing {restoreProgress.label}…</span>
                  </div>
                )}

                {restoreFile && plan && (
                  <div className="restore-preview">
                    <p className="restore-file">
                      <strong>{restoreFile.name}</strong> · made{" "}
                      {new Date(restoreFile.file.createdAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}{" "}
                      by {restoreFile.file.createdBy}
                    </p>
                    <table className="history-table restore-table">
                      <thead>
                        <tr>
                          <th>Collection</th>
                          <th>In the file</th>
                          <th>Missing now</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.map((p) => (
                          <tr key={p.id}>
                            <td>{p.label}</td>
                            <td>{p.inFile.toLocaleString("en-US")}</td>
                            <td className={p.missing.length ? "restore-missing" : ""}>
                              {p.missing.length.toLocaleString("en-US")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {missingTotal === 0 ? (
                      <p className="backup-success-text">Nothing is missing. Every record in this file is still in the system.</p>
                    ) : (
                      <>
                        <label htmlFor="restore-confirm" className="restore-confirm-label">
                          Type <strong>RESTORE</strong> to put back {missingTotal.toLocaleString("en-US")} missing records
                        </label>
                        <input
                          id="restore-confirm"
                          className="restore-confirm-input"
                          value={confirmText}
                          onChange={(e) => setConfirmText(e.target.value)}
                          autoComplete="off"
                          disabled={restoring}
                        />
                      </>
                    )}

                    {restoring && restoreProgress && (
                      <div className="backup-progress" aria-live="polite">
                        <div className="backup-progress-bar">
                          <span style={{ width: `${percent(restoreProgress)}%` }} />
                        </div>
                        <span>Restoring {restoreProgress.label}…</span>
                      </div>
                    )}

                    <div className="restore-actions">
                      <button type="button" className="btn-cancel-restore" onClick={resetRestore} disabled={restoring}>
                        Cancel
                      </button>
                      {missingTotal > 0 && (
                        <button
                          type="button"
                          className="btn-restore-now"
                          onClick={handleRestore}
                          disabled={restoring || confirmText.trim().toUpperCase() !== "RESTORE"}
                        >
                          {restoring ? <Loader2 size={16} className="spin" /> : <RotateCcw size={16} />}
                          {restoring ? "Restoring…" : "Restore missing records"}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {restoreDone && (
                  <div className="backup-success" role="status">
                    <strong>Restored {restoreDone.total.toLocaleString("en-US")} records.</strong>
                    {restoreDone.failed.length > 0 && (
                      <span className="backup-warn">Not restored: {restoreDone.failed.join(", ")}</span>
                    )}
                    <button type="button" className="link-btn" onClick={resetRestore}>
                      Restore another file
                    </button>
                  </div>
                )}
                {restoreError && <p className="backup-error">{restoreError}</p>}
              </article>
            </section>

            {/* HISTORY */}
            <article className="card">
              <div className="card-header-static">
                <h2 className="card-title-static">Backup History</h2>
              </div>

              {historyLoading ? (
                <div className="table-loading">
                  <RefreshCw size={20} className="spin" />
                  <p>Loading backup history...</p>
                </div>
              ) : history.length === 0 ? (
                <div className="table-empty">
                  <p>No backups yet. Use "Back up now" to make the first one.</p>
                </div>
              ) : (
                <div className="history-wrap">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Records</th>
                        <th>Size</th>
                        <th>By</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((row) => (
                        <tr key={row.id}>
                          <td className="cell-date">{formatDate(row.timestamp)}</td>
                          <td className="cell-type">
                            {row.type}
                            {row.note && <span className="history-note">{row.note}</span>}
                          </td>
                          <td>{row.records.toLocaleString("en-US")}</td>
                          <td className="cell-size">{row.size}</td>
                          <td>{row.by}</td>
                          <td>
                            <span
                              className={`history-pill ${
                                row.status === "Success"
                                  ? "pill-success"
                                  : row.status === "Failed"
                                  ? "pill-failed"
                                  : "pill-progress"
                              }`}
                            >
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>

            <p className="backup-footnote">
              Automatic nightly backups need Firebase's paid Blaze plan (scheduled database export).
              On the free plan, make a backup here at least once a week.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
