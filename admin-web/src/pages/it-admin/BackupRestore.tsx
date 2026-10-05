import { useEffect, useRef, useState } from "react";
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
  X,
  ChevronDown,
  Loader2,
  RefreshCw,
  Download,
  RotateCcw,
  AlertTriangle,
  QrCode,
} from "lucide-react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  addDoc,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./ITAdminHomePage.css";
import "./BackupRestore.css";

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
  | "impounding-staff";

type CurrentUser = {
  uid: string;
  name: string;
  role: RoleSlug;
};

type ScheduleStatus = "Active" | "Paused";

type BackupType =
  | "Full Backup (Firestore + Storage)"
  | "Firestore Only"
  | "Audit Log Archive";

type Frequency = "Daily" | "Weekly" | "Monthly";

type ScheduleRow = {
  id: string;
  name: string;
  description: string;
  status: ScheduleStatus;
  time: string;
  frequency: Frequency;
  backupType: BackupType;
  retentionDays: number;
};

type HistoryRow = {
  id: string;
  timestamp: Timestamp | null;
  date: string;
  type: string;
  size: string;
  status: "Success" | "Failed" | "In Progress";
  actionType: "Restore" | "Download";
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
};

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
   OPTIONS
------------------------------------------------------------------ */
const FREQUENCY_OPTIONS: Frequency[] = ["Daily", "Weekly", "Monthly"];

const BACKUP_TYPE_OPTIONS: BackupType[] = [
  "Full Backup (Firestore + Storage)",
  "Firestore Only",
  "Audit Log Archive",
];

const STATUS_OPTIONS: ScheduleStatus[] = ["Active", "Paused"];

/* ------------------------------------------------------------------
   FALLBACK DATA
------------------------------------------------------------------ */
const FALLBACK_SCHEDULES: Omit<ScheduleRow, "id">[] = [
  {
    name: "Nightly full backup",
    description: "Firestore export + Storage snapshot — runs at 2:00 AM daily",
    status: "Active",
    time: "2:00 AM",
    frequency: "Daily",
    backupType: "Full Backup (Firestore + Storage)",
    retentionDays: 30,
  },
  {
    name: "Audit log archive",
    description: "Compressed and exported weekly every Sunday 3:00 AM",
    status: "Active",
    time: "3:00 AM",
    frequency: "Weekly",
    backupType: "Audit Log Archive",
    retentionDays: 90,
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
      date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      ", " +
      date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    );
  } catch {
    return "—";
  }
};

const generateOICCode = (): string => {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "0123456789";
  let code = "OIC-";
  for (let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * letters.length)];
  code += "-";
  for (let i = 0; i < 4; i++) code += digits[Math.floor(Math.random() * digits.length)];
  return code;
};

/* ------------------------------------------------------------------
   EDIT SCHEDULE MODAL
------------------------------------------------------------------ */
type EditScheduleModalProps = {
  schedule: ScheduleRow;
  onClose: () => void;
  onSave: (updated: ScheduleRow) => void;
};

function EditScheduleModal({ schedule, onClose, onSave }: EditScheduleModalProps) {
  const [name, setName] = useState(schedule.name);
  const [time, setTime] = useState(schedule.time);
  const [frequency, setFrequency] = useState<Frequency>(schedule.frequency);
  const [backupType, setBackupType] = useState<BackupType>(schedule.backupType);
  const [retentionDays, setRetentionDays] = useState(String(schedule.retentionDays));
  const [status, setStatus] = useState<ScheduleStatus>(schedule.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setError("");

    if (!name.trim()) {
      setError("Schedule name is required.");
      return;
    }
    if (!time.trim()) {
      setError("Time is required.");
      return;
    }

    const retention = parseInt(retentionDays, 10);
    if (isNaN(retention) || retention < 1) {
      setError("Retention days must be a positive number.");
      return;
    }

    setSaving(true);

    try {
      const scheduleRef = doc(db, "backupSchedules", schedule.id);
      await updateDoc(scheduleRef, {
        name: name.trim(),
        time: time.trim(),
        frequency,
        backupType,
        retentionDays: retention,
        status,
        updatedAt: serverTimestamp(),
      });

      console.log("Schedule updated:", schedule.id);
      onSave({
        ...schedule,
        name: name.trim(),
        time: time.trim(),
        frequency,
        backupType,
        retentionDays: retention,
        status,
      });
    } catch (err: any) {
      console.error("Error updating schedule:", err);
      if (err.code === "permission-denied") {
        setError("Permission denied. Please check your Firestore rules.");
      } else {
        setError(err.message || "Failed to update schedule.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={saving ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Edit backup schedule — {schedule.name}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-field">
            <label htmlFor="edit-schedule-name">Schedule name</label>
            <input
              id="edit-schedule-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="edit-time">Time</label>
              <input
                id="edit-time"
                type="text"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="form-field">
              <label htmlFor="edit-frequency">Frequency</label>
              <div className="select-wrap">
                <select
                  id="edit-frequency"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as Frequency)}
                  disabled={saving}
                >
                  {FREQUENCY_OPTIONS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="select-icon" />
              </div>
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="edit-backup-type">Backup type</label>
            <div className="select-wrap">
              <select
                id="edit-backup-type"
                value={backupType}
                onChange={(e) => setBackupType(e.target.value as BackupType)}
                disabled={saving}
              >
                {BACKUP_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <ChevronDown size={16} className="select-icon" />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="edit-retention">Retention (days)</label>
            <input
              id="edit-retention"
              type="number"
              min={1}
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="form-field">
            <label htmlFor="edit-status">Status</label>
            <div className="select-wrap">
              <select
                id="edit-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as ScheduleStatus)}
                disabled={saving}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <ChevronDown size={16} className="select-icon" />
            </div>
          </div>

          {error && <p className="modal-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn-save" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 size={14} className="spin" /> Saving...</> : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   RESTORE CONFIRMATION MODAL
------------------------------------------------------------------ */
type RestoreModalProps = {
  row: HistoryRow;
  currentUser: CurrentUser;
  onClose: () => void;
  onConfirm: (authCode: string, reason: string) => Promise<void>;
};

function RestoreModal({ row, currentUser, onClose, onConfirm }: RestoreModalProps) {
  const [authCode, setAuthCode] = useState("");
  const [reason, setReason] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    setError("");

    if (!authCode.trim()) {
      setError("OIC authorization code is required.");
      return;
    }

    if (!reason.trim()) {
      setError("Please provide a reason for the restore.");
      return;
    }

    if (reason.trim().length < 10) {
      setError("Reason must be at least 10 characters.");
      return;
    }

    setRestoring(true);

    try {
      await onConfirm(authCode.trim(), reason.trim());
    } catch (err: any) {
      setError(err.message || "Failed to restore backup.");
      setRestoring(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={restoring ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Restore backup — {row.date}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={restoring}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="warning-box">
            <AlertTriangle size={20} className="warning-icon" />
            <p className="warning-text">
              <strong>This action is irreversible.</strong> Restoring will
              overwrite all current Firestore data with this backup snapshot.
              Confirm with the OIC before proceeding.
            </p>
          </div>

          <div className="restore-details-box">
            <div className="restore-detail-row">
              <span className="restore-detail-label">Backup date:</span>
              <span className="restore-detail-value">{row.date}</span>
            </div>
            <div className="restore-detail-row">
              <span className="restore-detail-label">Size:</span>
              <span className="restore-detail-value">{row.size}</span>
            </div>
            <div className="restore-detail-row">
              <span className="restore-detail-label">Type:</span>
              <span className="restore-detail-value">{row.type}</span>
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="oic-code">OIC authorization code (required)</label>
            <input
              id="oic-code"
              type="text"
              placeholder="Enter OIC-issued restore code"
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value.toUpperCase())}
              disabled={restoring}
              autoFocus
            />
          </div>

          <div className="form-field">
            <label htmlFor="restore-reason">Reason for restore</label>
            <textarea
              id="restore-reason"
              placeholder="Describe why a restore is needed"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={restoring}
              rows={4}
            />
          </div>

          {error && <p className="modal-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-cancel"
            onClick={onClose}
            disabled={restoring}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-save"
            onClick={handleConfirm}
            disabled={restoring}
          >
            {restoring ? (
              <>
                <Loader2 size={14} className="spin" /> Restoring...
              </>
            ) : (
              "Save Changes"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   MAIN COMPONENT
------------------------------------------------------------------ */
export default function BackupRestore() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    uid: "",
    name: "Loading...",
    role: "it-admin",
  });

  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleRow | null>(null);
  const [restoringRow, setRestoringRow] = useState<HistoryRow | null>(null);

  /* Fetch current user */
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

  /* Real-time: backupSchedules */
  useEffect(() => {
    const schedulesRef = collection(db, "backupSchedules");
    const schedulesQuery = query(schedulesRef, orderBy("name"));

    const unsubscribe = onSnapshot(
      schedulesQuery,
      (snapshot) => {
        if (snapshot.empty) {
          setSchedules([]);
        } else {
          const fetched: ScheduleRow[] = snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              name: data.name ?? "Untitled",
              description: data.description ?? "",
              status: (data.status ?? "Active") as ScheduleStatus,
              time: data.time ?? "—",
              frequency: (data.frequency ?? "Daily") as Frequency,
              backupType: (data.backupType ?? "Full Backup (Firestore + Storage)") as BackupType,
              retentionDays: data.retentionDays ?? 30,
            };
          });
          setSchedules(fetched);
        }
        setSchedulesLoading(false);
      },
      (error) => {
        console.error("Error fetching schedules:", error);
        setSchedulesLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  /* Real-time: backupHistory */
  useEffect(() => {
    const historyRef = collection(db, "backupHistory");
    const historyQuery = query(historyRef, orderBy("timestamp", "desc"));

    const unsubscribe = onSnapshot(
      historyQuery,
      (snapshot) => {
        const fetched: HistoryRow[] = snapshot.docs.map((d) => {
          const data = d.data();
          const type: string = data.type ?? "Full backup";
          return {
            id: d.id,
            timestamp: data.timestamp ?? null,
            date: formatDate(data.timestamp),
            type,
            size: data.size ?? "—",
            status: (data.status ?? "Success") as "Success" | "Failed" | "In Progress",
            actionType: type.toLowerCase().includes("audit") ? "Download" : "Restore",
          };
        });
        setHistory(fetched);
        setHistoryLoading(false);
      },
      (error) => {
        console.error("Error fetching history:", error);
        setHistoryLoading(false);
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
        setEditingSchedule(null);
        setRestoringRow(null);
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

  const handleScheduleSave = (updated: ScheduleRow) => {
    setSchedules((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setEditingSchedule(null);
  };

  const handleRestoreConfirm = async (authCode: string, reason: string) => {
    if (!restoringRow) return;

    try {
      await addDoc(collection(db, "auditLogs"), {
        userId: currentUser.uid,
        userName: currentUser.name,
        action: `requested restore from backup (${restoringRow.date})`,
        type: "backup",
        metadata: {
          backupId: restoringRow.id,
          backupDate: restoringRow.date,
          backupSize: restoringRow.size,
          authCode,
          reason,
        },
        timestamp: serverTimestamp(),
      });

      console.log("Restore logged:", {
        backupId: restoringRow.id,
        authCode,
        reason,
      });

      await new Promise((resolve) => setTimeout(resolve, 1200));

      setRestoringRow(null);

      alert(
        `Restore request submitted for backup from ${restoringRow.date}.\n\nThe OIC will be notified for final approval.`
      );
    } catch (err: any) {
      console.error("Restore failed:", err);
      throw new Error(err.message || "Failed to submit restore request.");
    }
  };

  const handleDownload = (row: HistoryRow) => {
    console.log("Download requested for:", row.id);
    alert(`Download requested for archive from ${row.date}. This is a demo action.`);
  };

  const displaySchedules = schedulesLoading
    ? []
    : schedules.length === 0
    ? FALLBACK_SCHEDULES.map((s, idx) => ({ ...s, id: `fallback-${idx}` }))
    : schedules;

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
              <h1>Backup &amp; Restore</h1>
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

          <div className="backup-content">
            {/* BACKUP SCHEDULE */}
            <article className="card">
              <div className="card-header-static">
                <h2 className="card-title-static">Backup Schedule</h2>
              </div>

              {schedulesLoading ? (
                <div className="table-loading">
                  <RefreshCw size={20} className="spin" />
                  <p>Loading schedules...</p>
                </div>
              ) : (
                <ul className="schedule-list">
                  {displaySchedules.map((s) => (
                    <li className="schedule-item" key={s.id}>
                      <div className="schedule-info">
                        <p className="schedule-name">{s.name}</p>
                        <p className="schedule-description">{s.description}</p>
                      </div>
                      <div className="schedule-actions">
                        <span
                          className={`schedule-status ${
                            s.status === "Active" ? "status-active" : "status-paused"
                          }`}
                        >
                          {s.status}
                        </span>
                        <button
                          type="button"
                          className="btn-edit-schedule"
                          onClick={() => setEditingSchedule(s)}
                        >
                          Edit Schedule
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            {/* BACKUP HISTORY */}
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
                  <p>No backup history available yet.</p>
                </div>
              ) : (
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Size</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr key={row.id}>
                        <td className="cell-date">{row.date}</td>
                        <td className="cell-type">{row.type}</td>
                        <td className="cell-size">{row.size}</td>
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
                        <td>
                          {row.actionType === "Restore" ? (
                            <button
                              type="button"
                              className="btn-restore"
                              onClick={() => setRestoringRow(row)}
                            >
                              <RotateCcw size={14} />
                              Restore
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-download"
                              onClick={() => handleDownload(row)}
                            >
                              <Download size={14} />
                              Download
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

      {/* EDIT SCHEDULE MODAL */}
      {editingSchedule && (
        <EditScheduleModal
          schedule={editingSchedule}
          onClose={() => setEditingSchedule(null)}
          onSave={handleScheduleSave}
        />
      )}

      {/* RESTORE CONFIRMATION MODAL */}
      {restoringRow && (
        <RestoreModal
          row={restoringRow}
          currentUser={currentUser}
          onClose={() => setRestoringRow(null)}
          onConfirm={handleRestoreConfirm}
        />
      )}
    </div>
  );
}