/* ------------------------------------------------------------------
   SUPERVISOR — Operation Scheduler (/supervisor/operation-scheduler)

   The Supervisor's own page: same content as the OIC's Operation Scheduler, but
   with the Supervisor's sidebar (no Payment/Finance; links stay on
   /supervisor/...). The Supervisor monitors operations and approves
   vehicle release; payments are not handled here.
   Schedules operations (Hotline 8888 complaints / MTPB orders), starts,
   completes or cancels them; History keeps the operations log.
   Styles: ./OperationScheduler.css (a copy of the OIC page's CSS).
------------------------------------------------------------------ */
import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, X, Plus } from "lucide-react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./OperationScheduler.css";

import logo from "../../assets/mtpb-logo.png";
import avatarImg from "../../assets/user.png";
import logoutIcon from "../../assets/logout.png";

import overviewIcon from "../../assets/overview.png";
import sectorAnalyticsIcon from "../../assets/sectoranalytics.png";
import mapIcon from "../../assets/map.png";
import clampingIcon from "../../assets/clamping.png";
import impoundingIcon from "../../assets/impounding.png";
import historyIcon from "../../assets/history.png";
import releaseRequestIcon from "../../assets/releaserequest.png";
import queueIcon from "../../assets/queue.png";
import releaseLogIcon from "../../assets/releaselog.png";
import fieldUpdateIcon from "../../assets/fieldupdate.png";
import operationSchedulerIcon from "../../assets/scheduler.png";

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

type CurrentUser = { name: string; role: RoleSlug };

/* Per MTPB: operations are run on complaints of obstruction and/or
   illegal parking — most often from Hotline 8888 (the President's
   complaint hotline) — or on an order from MTPB. Every operation is kept
   as a history log: nothing is deleted, only Completed or Cancelled. */
type OperationSource = "Hotline 8888" | "MTPB Order" | "Other Complaint";
type ComplaintType = "Obstruction" | "Illegal Parking" | "Obstruction & Illegal Parking";
type OperationStatus = "Scheduled" | "Ongoing" | "Completed" | "Cancelled";

type Schedule = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  timeStart: string; // HH:MM
  timeEnd: string; // HH:MM
  team: string;
  focus: string;
  source: OperationSource;
  referenceNo: string;
  complaintType: ComplaintType;
  location: string;
  status: OperationStatus;
  vehiclesClamped: number | null;
  remarks: string;
  cancelReason: string;
};

type ScheduleFormData = Pick<
  Schedule,
  | "date"
  | "title"
  | "timeStart"
  | "timeEnd"
  | "team"
  | "focus"
  | "source"
  | "referenceNo"
  | "complaintType"
  | "location"
>;

type SchedulerTab = "upcoming" | "history";

type NavItem = { label: string; icon: string; path: string; active?: boolean };
type NavGroup = { label: string; items: NavItem[] };

/* ------------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------------ */
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
    items: [
      { label: "Overview", icon: overviewIcon, path: "/supervisor" },
      {
        label: "Sector Analytics",
        icon: sectorAnalyticsIcon,
        path: "/supervisor/sector-analytics",
      },
      {
        label: "Geospatial Heatmap",
        icon: mapIcon,
        path: "/supervisor/heatmap",
      },
    ],
  },
  {
    label: "Enforcement",
    items: [
      { label: "Clamping Log", icon: clampingIcon, path: "/supervisor/clamping" },
      {
        label: "Impounding Log",
        icon: impoundingIcon,
        path: "/supervisor/impounding",
      },
      {
        label: "Vehicle History",
        icon: historyIcon,
        path: "/supervisor/vehicle-history",
      },
    ],
  },
  {
    label: "Vehicle Release",
    items: [
      {
        label: "Release Requests",
        icon: releaseRequestIcon,
        path: "/supervisor/release-requests",
      },
      {
        label: "Release Queue",
        icon: queueIcon,
        path: "/supervisor/release-queue",
      },
      {
        label: "Release Log",
        icon: releaseLogIcon,
        path: "/supervisor/release-log",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Field Updates",
        icon: fieldUpdateIcon,
        path: "/supervisor/field-updates",
      },
      {
        label: "Operation Scheduler",
        icon: operationSchedulerIcon,
        path: "/supervisor/operation-scheduler",
        active: true,
      },
    ],
  },
];

/* ------------------------------------------------------------------
   HELPERS
------------------------------------------------------------------ */
/** Local YYYY-MM-DD, matching how <input type="date"> stores it — not
 *  toISOString(), which is UTC and can land on the wrong calendar day. */
const SOURCE_OPTIONS: OperationSource[] = ["Hotline 8888", "MTPB Order", "Other Complaint"];

const COMPLAINT_OPTIONS: ComplaintType[] = [
  "Obstruction",
  "Illegal Parking",
  "Obstruction & Illegal Parking",
];

const STATUS_CLASS: Record<OperationStatus, string> = {
  Scheduled: "op-status-scheduled",
  Ongoing: "op-status-ongoing",
  Completed: "op-status-completed",
  Cancelled: "op-status-cancelled",
};

const asSource = (v: unknown): OperationSource =>
  SOURCE_OPTIONS.includes(v as OperationSource) ? (v as OperationSource) : "Other Complaint";

const asComplaint = (v: unknown): ComplaintType =>
  COMPLAINT_OPTIONS.includes(v as ComplaintType) ? (v as ComplaintType) : "Illegal Parking";

const asStatus = (v: unknown): OperationStatus =>
  ["Scheduled", "Ongoing", "Completed", "Cancelled"].includes(String(v))
    ? (v as OperationStatus)
    : "Scheduled";

const todayKey = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
};

function formatDate(isoDate: string): string {
  if (!isoDate) return "";
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(time24: string): string {
  if (!time24) return "";
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, "0")}${period}`;
}

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function SupervisorOperationScheduler() {
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "supervisor",
  });
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [tab, setTab] = useState<SchedulerTab>("upcoming");
  const [completing, setCompleting] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [teamNames, setTeamNames] = useState<string[]>([]);

  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  /* Current user */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) {
        setCurrentUser({ name: "Guest", role: "supervisor" });
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", loggedUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          setCurrentUser({
            name: data.name ?? "Unknown",
            role: (data.role ?? "supervisor") as RoleSlug,
          });
        }
      } catch (err) {
        console.error("Failed to load current user:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  /**
   * Every operation is kept: Upcoming shows Scheduled / Ongoing (including
   * ones whose date has passed, so they can still be closed out), History
   * shows Completed / Cancelled — the operations log MTPB asked for.
   */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "operationSchedules"),
      (snap) => {
        const fetched: Schedule[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              date: data.date ?? "",
              title: data.title ?? "—",
              timeStart: data.timeStart ?? "",
              timeEnd: data.timeEnd ?? "",
              team: data.team ?? "—",
              focus: data.focus ?? "",
              source: asSource(data.source),
              referenceNo: data.referenceNo ?? "",
              complaintType: asComplaint(data.complaintType),
              location: data.location ?? "",
              status: asStatus(data.status),
              vehiclesClamped:
                typeof data.vehiclesClamped === "number" ? data.vehiclesClamped : null,
              remarks: data.remarks ?? "",
              cancelReason: data.cancelReason ?? "",
            };
          })
          .sort((a, b) => {
            if (a.date !== b.date) return a.date < b.date ? -1 : 1;
            return a.timeStart < b.timeStart ? -1 : 1;
          });

        setSchedules(fetched);
        setLoading(false);
      },
      (err) => {
        console.warn("Operation schedules fetch failed:", err.code);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  /** Team suggestions from the clampingTeams collection, if any. The team
   *  field is free text, since there is no team-management page. */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "clampingTeams"),
      (snap) => {
        const names = snap.docs
          .map((d) => (d.data().name as string) ?? null)
          .filter((n): n is string => Boolean(n))
          .sort();
        setTeamNames(names);
      },
      (err) => console.warn("Team names fetch failed:", err.code)
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

  /** Supervisors see the same pages as the OIC, minus Payment/Finance. */
  const navGroups = useMemo(
    () =>
      NAV_GROUPS.filter(
        (group) =>
          !(currentUser.role === "supervisor" && group.label === "Payment/Finance")
      ),
    [currentUser.role]
  );

  const handleSave = async (data: ScheduleFormData) => {
    try {
      const batch = {
        ...data,
        title:
          data.title.trim() ||
          `${data.complaintType} — ${data.location || data.team}`,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.name,
      };

      if (modalMode === "add") {
        await addDoc(collection(db, "operationSchedules"), {
          ...batch,
          status: "Scheduled",
          vehiclesClamped: null,
          remarks: "",
          cancelReason: "",
          createdAt: serverTimestamp(),
          createdBy: currentUser.name,
          createdByRole: currentUser.role,
        });
        await addDoc(collection(db, "auditLogs"), {
          userName: currentUser.name,
          action: `scheduled operation "${batch.title}" (${data.source}${
            data.referenceNo ? ` #${data.referenceNo}` : ""
          }) for ${data.team} on ${data.date}`,
          record: batch.title,
          type: "operation-scheduler",
          metadata: { ...data },
          timestamp: serverTimestamp(),
        });
      } else if (modalMode === "edit" && editingSchedule) {
        await updateDoc(
          doc(db, "operationSchedules", editingSchedule.id),
          batch
        );
        await addDoc(collection(db, "auditLogs"), {
          userName: currentUser.name,
          action: `updated operation "${batch.title}"`,
          record: batch.title,
          type: "operation-scheduler",
          metadata: { ...data },
          timestamp: serverTimestamp(),
        });
      }

      setModalMode(null);
      setEditingSchedule(null);
    } catch (err: any) {
      console.error("Failed to save schedule:", err);
      alert(err.message || "Failed to save schedule.");
    }
  };

  /** Status changes keep the record — the operations history log. */
  const updateStatus = async (
    schedule: Schedule,
    status: OperationStatus,
    extra: Record<string, unknown>,
    action: string
  ) => {
    try {
      await updateDoc(doc(db, "operationSchedules", schedule.id), {
        status,
        ...extra,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.name,
      });
      await addDoc(collection(db, "auditLogs"), {
        userName: currentUser.name,
        userRole: currentUser.role,
        action: `${action} operation "${schedule.title}"`,
        record: schedule.title,
        type: "operation-scheduler",
        metadata: { id: schedule.id, status, ...extra },
        timestamp: serverTimestamp(),
      });
    } catch (err: any) {
      console.error(`Failed to set ${status}:`, err);
      alert(err.message || "Failed to update the operation.");
    }
  };

  const handleStart = (s: Schedule) =>
    updateStatus(
      s,
      "Ongoing",
      { startedAt: serverTimestamp(), startedBy: currentUser.name },
      "started"
    );

  const handleComplete = async (s: Schedule, vehiclesClamped: number, remarks: string) => {
    await updateStatus(
      s,
      "Completed",
      {
        vehiclesClamped,
        remarks,
        completedAt: serverTimestamp(),
        completedBy: currentUser.name,
      },
      "completed"
    );
    setCompleting(null);
  };

  const handleCancel = (s: Schedule) => {
    const reason = window.prompt(
      `Cancel "${s.title}" (${formatDate(s.date)}, ${s.team})?\n\nReason (kept in the operations log):`
    );
    if (reason === null) return;
    if (!reason.trim()) {
      alert("A reason is required.");
      return;
    }
    updateStatus(
      s,
      "Cancelled",
      {
        cancelReason: reason.trim(),
        cancelledAt: serverTimestamp(),
        cancelledBy: currentUser.name,
      },
      "cancelled"
    );
  };

  const upcoming = useMemo(
    () => schedules.filter((s) => s.status === "Scheduled" || s.status === "Ongoing"),
    [schedules]
  );
  const history = useMemo(
    () =>
      schedules
        .filter((s) => s.status === "Completed" || s.status === "Cancelled")
        .reverse(),
    [schedules]
  );
  const shown = tab === "upcoming" ? upcoming : history;
  const today = todayKey();

  return (
    <div className="oic-page scheduler-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <img src={logo} alt="MTPB logo" className="sidebar-logo-img" />
            <div>
              <p className="sidebar-brand-name">MTPB</p>
              <p className="sidebar-brand-role">
                {ROLE_LABELS[currentUser.role]}
              </p>
            </div>
          </div>

          <nav className="sidebar-nav">
            {navGroups.map((group) => (
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

        {/* MAIN */}
        <div className="main">
          <header className="main-header">
            <div>
              <h1>Operation Scheduler</h1>
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
                src={avatarImg}
                alt="Account menu"
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
                  <button className="dropdown-item">
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
              <div className="log-header">
                <div className="op-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === "upcoming"}
                    className={`op-tab${tab === "upcoming" ? " is-active" : ""}`}
                    onClick={() => setTab("upcoming")}
                  >
                    Upcoming ({upcoming.length})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === "history"}
                    className={`op-tab${tab === "history" ? " is-active" : ""}`}
                    onClick={() => setTab("history")}
                  >
                    History ({history.length})
                  </button>
                </div>
                <button
                  type="button"
                  className="btn-add-schedule"
                  onClick={() => {
                    setModalMode("add");
                    setEditingSchedule(null);
                  }}
                >
                  <Plus size={16} />
                  Add Operation
                </button>
              </div>
              <h2 className="card-title" style={{ marginBottom: 4 }}>
                Operation Schedules
              </h2>
              <p className="op-subtitle">
                Operations on complaints of obstruction / illegal parking (Hotline 8888)
                or on MTPB orders. Nothing is deleted — completed and cancelled operations
                stay in History.
              </p>

              {loading ? (
                <div className="table-loading">
                  <p>Loading schedules...</p>
                </div>
              ) : shown.length === 0 ? (
                <div className="scheduler-empty">
                  <p className="scheduler-empty-text">
                    {tab === "upcoming"
                      ? "No upcoming operations."
                      : "No completed or cancelled operations yet."}
                  </p>
                </div>
              ) : (
                <div className="scheduler-list">
                  {shown.map((s) => (
                    <div key={s.id} className="scheduler-item">
                      <span className="scheduler-date">
                        {formatDate(s.date)}
                      </span>

                      <div className="scheduler-info">
                        <div className="scheduler-title">
                          {s.title}
                          <span className={`op-status ${STATUS_CLASS[s.status]}`}>
                            {s.status}
                          </span>
                          {s.status === "Scheduled" && s.date < today && (
                            <span className="op-overdue">Past date</span>
                          )}
                        </div>
                        <div className="op-tags">
                          <span
                            className={`op-source${
                              s.source === "Hotline 8888" ? " op-source-8888" : ""
                            }`}
                          >
                            {s.source}
                            {s.referenceNo ? ` #${s.referenceNo}` : ""}
                          </span>
                          <span className="op-complaint">{s.complaintType}</span>
                        </div>
                        <div className="scheduler-detail">
                          {formatTime(s.timeStart)}–{formatTime(s.timeEnd)} · {s.team}
                          {s.location ? ` · ${s.location}` : ""}
                          {s.focus ? ` · ${s.focus}` : ""}
                        </div>
                        {s.status === "Completed" && (
                          <div className="op-result">
                            Result: {s.vehiclesClamped ?? 0} vehicle
                            {s.vehiclesClamped === 1 ? "" : "s"} clamped
                            {s.remarks ? ` · ${s.remarks}` : ""}
                          </div>
                        )}
                        {s.status === "Cancelled" && s.cancelReason && (
                          <div className="op-result op-result-cancelled">
                            Cancelled: {s.cancelReason}
                          </div>
                        )}
                      </div>

                      {(s.status === "Scheduled" || s.status === "Ongoing") && (
                        <div className="scheduler-actions">
                          {s.status === "Scheduled" ? (
                            <button
                              type="button"
                              className="btn-mini-outline"
                              onClick={() => handleStart(s)}
                            >
                              Start
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-mini-outline"
                              onClick={() => setCompleting(s)}
                            >
                              Complete
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-mini-outline"
                            onClick={() => {
                              setEditingSchedule(s);
                              setModalMode("edit");
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn-mini-outline btn-mini-danger"
                            onClick={() => handleCancel(s)}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {modalMode && (
        <ScheduleModal
          schedule={modalMode === "edit" ? editingSchedule : null}
          teamNames={teamNames}
          onClose={() => {
            setModalMode(null);
            setEditingSchedule(null);
          }}
          onSave={handleSave}
        />
      )}

      {completing && (
        <CompleteModal
          schedule={completing}
          onClose={() => setCompleting(null)}
          onSave={(count, remarks) => handleComplete(completing, count, remarks)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   COMPLETE MODAL — records the operation's result in the log
------------------------------------------------------------------ */
function CompleteModal({
  schedule,
  onClose,
  onSave,
}: {
  schedule: Schedule;
  onClose: () => void;
  onSave: (vehiclesClamped: number, remarks: string) => Promise<void>;
}) {
  const [count, setCount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const submit = async () => {
    const n = Number(count);
    if (count.trim() === "" || !Number.isInteger(n) || n < 0) {
      setError("Enter how many vehicles were clamped (0 or more).");
      return;
    }
    setIsSaving(true);
    try {
      await onSave(n, remarks.trim());
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={isSaving ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Complete operation: {schedule.title}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-stack">
            <div>
              <label className="form-label">Vehicles clamped</label>
              <input
                type="number"
                min={0}
                step={1}
                value={count}
                onChange={(e) => {
                  setCount(e.target.value);
                  setError("");
                }}
                className="form-input"
                disabled={isSaving}
              />
            </div>
            <div>
              <label className="form-label">Remarks</label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Complaint resolved; 2 vehicles towed"
                rows={3}
                className="form-textarea"
                disabled={isSaving}
              />
            </div>
            {error && <p className="form-error">{error}</p>}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-cancel" onClick={onClose} disabled={isSaving}>
            Back
          </button>
          <button type="button" className="btn-confirm" onClick={submit} disabled={isSaving}>
            {isSaving ? "Saving..." : "Mark Completed"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   SCHEDULE MODAL
------------------------------------------------------------------ */
type ScheduleModalProps = {
  schedule: Schedule | null;
  teamNames: string[];
  onClose: () => void;
  onSave: (data: ScheduleFormData) => void;
};

function ScheduleModal({
  schedule,
  teamNames,
  onClose,
  onSave,
}: ScheduleModalProps) {
  const isEdit = !!schedule;
  const [form, setForm] = useState<ScheduleFormData>({
    title: schedule?.title ?? "",
    date: schedule?.date ?? "",
    team: schedule?.team ?? teamNames[0] ?? "",
    timeStart: schedule?.timeStart ?? "",
    timeEnd: schedule?.timeEnd ?? "",
    focus: schedule?.focus ?? "",
    source: schedule?.source ?? "Hotline 8888",
    referenceNo: schedule?.referenceNo ?? "",
    complaintType: schedule?.complaintType ?? "Illegal Parking",
    location: schedule?.location ?? "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");


  function set<K extends keyof ScheduleFormData>(
    field: K,
    value: ScheduleFormData[K]
  ) {
    setForm((f) => ({ ...f, [field]: value }));
    setError("");
  }

  const handleSubmit = async () => {
    if (!form.location.trim()) return setError("Enter the location to operate on.");
    if (form.source !== "Other Complaint" && !form.referenceNo.trim())
      return setError(
        form.source === "Hotline 8888"
          ? "Enter the Hotline 8888 complaint reference no."
          : "Enter the MTPB order no."
      );
    if (!form.date) return setError("Select a date.");
    if (!form.team.trim()) return setError("Enter the team or officers assigned.");
    if (!form.timeStart || !form.timeEnd)
      return setError("Enter both a start and end time.");

    setIsSaving(true);
    try {
      await onSave(form);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={isSaving ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            {isEdit && schedule
              ? `Edit operation: ${schedule.title}`
              : "Add Operation"}
          </h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-stack">
            <div className="form-grid-2">
              <div>
                <label className="form-label">Basis of operation</label>
                <select
                  value={form.source}
                  onChange={(e) => set("source", e.target.value as OperationSource)}
                  className="form-input"
                  disabled={isSaving}
                >
                  {SOURCE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o === "Hotline 8888" ? "Hotline 8888 complaint" : o}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">
                  {form.source === "MTPB Order" ? "Order No." : "Complaint Reference No."}
                  {form.source === "Other Complaint" ? " (optional)" : ""}
                </label>
                <input
                  type="text"
                  value={form.referenceNo}
                  onChange={(e) => set("referenceNo", e.target.value)}
                  placeholder={form.source === "MTPB Order" ? "e.g. MTPB-ORD-0123" : "e.g. 8888-2026-004512"}
                  className="form-input"
                  disabled={isSaving}
                />
              </div>
            </div>

            <div className="form-grid-2">
              <div>
                <label className="form-label">Complaint</label>
                <select
                  value={form.complaintType}
                  onChange={(e) => set("complaintType", e.target.value as ComplaintType)}
                  className="form-input"
                  disabled={isSaving}
                >
                  {COMPLAINT_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Location</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="e.g. Recto Ave. cor. Quezon Blvd."
                  className="form-input"
                  disabled={isSaving}
                />
              </div>
            </div>

            <div>
              <label className="form-label">Operation Title (optional)</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Left blank: complaint — location"
                className="form-input"
                disabled={isSaving}
              />
            </div>

            <div className="form-grid-2">
              <div>
                <label className="form-label">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => set("date", e.target.value)}
                  className="form-input"
                  disabled={isSaving}
                />
              </div>

              <div>
                <label className="form-label">Team / Officers</label>
                <input
                  type="text"
                  list="op-team-options"
                  value={form.team}
                  onChange={(e) => set("team", e.target.value)}
                  placeholder="e.g. Team Reyes"
                  className="form-input"
                  disabled={isSaving}
                />
                <datalist id="op-team-options">
                  {teamNames.map((team) => (
                    <option key={team} value={team} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="form-grid-2">
              <div>
                <label className="form-label">Time Start</label>
                <input
                  type="time"
                  value={form.timeStart}
                  onChange={(e) => set("timeStart", e.target.value)}
                  className="form-input"
                  disabled={isSaving}
                />
              </div>
              <div>
                <label className="form-label">Time End</label>
                <input
                  type="time"
                  value={form.timeEnd}
                  onChange={(e) => set("timeEnd", e.target.value)}
                  className="form-input"
                  disabled={isSaving}
                />
              </div>
            </div>

            <div>
              <label className="form-label">Focus / notes</label>
              <textarea
                value={form.focus}
                onChange={(e) => set("focus", e.target.value)}
                placeholder="Focus or notes"
                rows={3}
                className="form-textarea"
                disabled={isSaving}
              />
            </div>

            {error && <p className="form-error">{error}</p>}
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-cancel"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-confirm"
            onClick={handleSubmit}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : isEdit ? "Save Changes" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}