import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, X, ChevronDown, Plus } from "lucide-react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
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
import pendingPaymentsIcon from "../../assets/pendingpayments.png";
import paymentVerificationIcon from "../../assets/paymentverification.png";
import transactionIcon from "../../assets/transaction.png";
import revenueIcon from "../../assets/revenue.png";
import releaseRequestIcon from "../../assets/releaserequest.png";
import queueIcon from "../../assets/queue.png";
import releaseLogIcon from "../../assets/releaselog.png";
import clampingTeamsIcon from "../../assets/clampingteams.png";
import towTruckIcon from "../../assets/tow-truck.png";
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

type Schedule = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  timeStart: string; // HH:MM
  timeEnd: string; // HH:MM
  team: string;
  focus: string;
};

type ScheduleFormData = Omit<Schedule, "id">;

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
      { label: "Overview", icon: overviewIcon, path: "/dashboard" },
      {
        label: "Sector Analytics",
        icon: sectorAnalyticsIcon,
        path: "/dashboard/sector-analytics",
      },
      {
        label: "Geospatial Heatmap",
        icon: mapIcon,
        path: "/dashboard/heatmap",
      },
    ],
  },
  {
    label: "Enforcement",
    items: [
      { label: "Clamping Log", icon: clampingIcon, path: "/dashboard/clamping" },
      {
        label: "Impounding Log",
        icon: impoundingIcon,
        path: "/dashboard/impounding",
      },
      {
        label: "Vehicle History",
        icon: historyIcon,
        path: "/dashboard/vehicle-history",
      },
    ],
  },
  {
    label: "Payment/Finance",
    items: [
      {
        label: "Pending Payments",
        icon: pendingPaymentsIcon,
        path: "/dashboard/pending-payments",
      },
      {
        label: "Payment Verification",
        icon: paymentVerificationIcon,
        path: "/dashboard/verification",
      },
      {
        label: "Transaction History",
        icon: transactionIcon,
        path: "/dashboard/transactions",
      },
      { label: "Revenue Reports", icon: revenueIcon, path: "/dashboard/revenue" },
    ],
  },
  {
    label: "Vehicle Release",
    items: [
      {
        label: "Release Requests",
        icon: releaseRequestIcon,
        path: "/dashboard/release-requests",
      },
      {
        label: "Release Queue",
        icon: queueIcon,
        path: "/dashboard/release-queue",
      },
      {
        label: "Release Log",
        icon: releaseLogIcon,
        path: "/dashboard/release-log",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Active Clamping Teams",
        icon: clampingTeamsIcon,
        path: "/dashboard/clamping-teams",
      },
      {
        label: "Active Impounding",
        icon: towTruckIcon,
        path: "/dashboard/active-impounding",
      },
      {
        label: "Field Updates",
        icon: fieldUpdateIcon,
        path: "/dashboard/field-updates",
      },
      {
        label: "Operation Scheduler",
        icon: operationSchedulerIcon,
        path: "/dashboard/operation-scheduler",
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
export default function OperationScheduler() {
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "oic",
  });
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamNames, setTeamNames] = useState<string[]>([]);

  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  /* Current user */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) {
        setCurrentUser({ name: "Guest", role: "oic" });
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", loggedUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          setCurrentUser({
            name: data.name ?? "Unknown",
            role: (data.role ?? "oic") as RoleSlug,
          });
        }
      } catch (err) {
        console.error("Failed to load current user:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  /**
   * New collection — operationSchedules doesn't exist anywhere else in
   * this project yet, same situation as clampingTeams. "UPCOMING" in the
   * design means today-or-future only; past schedules stay in Firestore
   * (nothing deletes them automatically) but don't show here.
   */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "operationSchedules"),
      (snap) => {
        const today = todayKey();
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
            };
          })
          .filter((s) => s.date >= today)
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

  /** Team dropdown pulled from the real clampingTeams collection (see
   *  pages/oic/ActiveClampingTeams.tsx) instead of a hardcoded list, so
   *  the two pages can't drift out of sync. */
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
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.name,
      };

      if (modalMode === "add") {
        await addDoc(collection(db, "operationSchedules"), {
          ...batch,
          createdAt: serverTimestamp(),
          createdBy: currentUser.name,
        });
        await addDoc(collection(db, "auditLogs"), {
          userName: currentUser.name,
          action: `scheduled operation "${data.title}" for ${data.team} on ${data.date}`,
          record: data.title,
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
          action: `updated operation "${data.title}"`,
          record: data.title,
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

  const handleDelete = async (schedule: Schedule) => {
    if (
      !confirm(
        `Delete "${schedule.title}" (${formatDate(schedule.date)}, ${
          schedule.team
        })? This cannot be undone.`
      )
    ) {
      return;
    }

    try {
      await deleteDoc(doc(db, "operationSchedules", schedule.id));
      await addDoc(collection(db, "auditLogs"), {
        userName: currentUser.name,
        action: `deleted operation "${schedule.title}"`,
        record: schedule.title,
        type: "operation-scheduler",
        metadata: { title: schedule.title, team: schedule.team },
        timestamp: serverTimestamp(),
      });
    } catch (err: any) {
      console.error("Failed to delete schedule:", err);
      alert(err.message || "Failed to delete schedule.");
    }
  };

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
                <p className="card-eyebrow">Upcoming</p>
                <button
                  type="button"
                  className="btn-add-schedule"
                  onClick={() => {
                    setModalMode("add");
                    setEditingSchedule(null);
                  }}
                >
                  <Plus size={16} />
                  Add Schedule
                </button>
              </div>
              <h2 className="card-title" style={{ marginBottom: 16 }}>
                Operation Schedules
              </h2>

              {loading ? (
                <div className="table-loading">
                  <p>Loading schedules...</p>
                </div>
              ) : schedules.length === 0 ? (
                <div className="scheduler-empty">
                  <p className="scheduler-empty-text">
                    You have no available schedule.
                  </p>
                </div>
              ) : (
                <div className="scheduler-list">
                  {schedules.map((s) => (
                    <div key={s.id} className="scheduler-item">
                      <span className="scheduler-date">
                        {formatDate(s.date)}
                      </span>

                      <div className="scheduler-info">
                        <div className="scheduler-title">{s.title}</div>
                        <div className="scheduler-detail">
                          {formatTime(s.timeStart)}–{formatTime(s.timeEnd)} ·{" "}
                          {s.team}
                          {s.focus ? ` · Focus: ${s.focus}` : ""}
                        </div>
                      </div>

                      <div className="scheduler-actions">
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
                          onClick={() => handleDelete(s)}
                        >
                          Delete
                        </button>
                      </div>
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
  });
  const [teamOpen, setTeamOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const teamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (teamRef.current && !teamRef.current.contains(e.target as Node)) {
        setTeamOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function set<K extends keyof ScheduleFormData>(
    field: K,
    value: ScheduleFormData[K]
  ) {
    setForm((f) => ({ ...f, [field]: value }));
    setError("");
  }

  const handleSubmit = async () => {
    if (!form.title.trim()) return setError("Enter an operation title.");
    if (!form.date) return setError("Select a date.");
    if (!form.team) return setError("Select a team.");
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
              : "Add Schedule"}
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
            <div>
              <label className="form-label">Operation Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Title"
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
                <label className="form-label">Team</label>
                <div className="form-dropdown" ref={teamRef}>
                  <button
                    type="button"
                    onClick={() => setTeamOpen((o) => !o)}
                    className="form-dropdown-trigger"
                    disabled={isSaving || teamNames.length === 0}
                  >
                    <span>
                      {form.team || (
                        <span className="form-dropdown-placeholder">
                          {teamNames.length === 0
                            ? "No teams yet"
                            : "Select a team"}
                        </span>
                      )}
                    </span>
                    <ChevronDown size={16} className="form-dropdown-chevron" />
                  </button>

                  {teamOpen && teamNames.length > 0 && (
                    <div className="form-dropdown-menu">
                      {teamNames.map((team) => (
                        <button
                          key={team}
                          type="button"
                          onClick={() => {
                            set("team", team);
                            setTeamOpen(false);
                          }}
                          className={`form-dropdown-item${
                            form.team === team ? " is-selected" : ""
                          }`}
                        >
                          {team}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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