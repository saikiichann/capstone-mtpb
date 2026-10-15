import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, X, ChevronDown, Users, MapPin } from "lucide-react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./ActiveClampingTeams.css";

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

type TeamStatus = "On Patrol" | "Standby" | "Off Duty";

type Team = {
  id: string;
  name: string;
  lead: string;
  area: string;
  members: string[];
  status: TeamStatus;
};

type NavItem = { label: string; icon: string; path: string; active?: boolean };
type NavGroup = { label: string; items: NavItem[] };

/* ------------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------------ */
const STATUS_OPTIONS: TeamStatus[] = ["On Patrol", "Standby", "Off Duty"];

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
        active: true,
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
      },
    ],
  },
];

/* ------------------------------------------------------------------
   HELPERS
------------------------------------------------------------------ */
const getStatusClass = (status: TeamStatus): string => {
  const map: Record<TeamStatus, string> = {
    "On Patrol": "status-on-patrol",
    Standby: "status-standby",
    "Off Duty": "status-off-duty",
  };
  return map[status] ?? "";
};

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function ActiveClampingTeams() {
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "oic",
  });
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);

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
   * New collection — clampingTeams doesn't exist anywhere else in this
   * project yet. There's no "create team" affordance in the design, so
   * teams have to be created directly in Firestore for now; this page
   * only lists and updates status.
   */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "clampingTeams"),
      (snap) => {
        const fetched: Team[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              name: data.name ?? "—",
              lead: data.lead ?? "—",
              area: data.area ?? "—",
              members: Array.isArray(data.members) ? data.members : [],
              status: (data.status ?? "Off Duty") as TeamStatus,
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        setTeams(fetched);
        setLoading(false);
      },
      (err) => {
        console.warn("Clamping teams fetch failed:", err.code);
        setLoading(false);
      }
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

  /** Leads = one per team; officers = members array lengths summed,
   *  not counting the lead — matches the design's "3 · 10" split. */
  const totalLeads = teams.length;
  const totalOfficers = teams.reduce((sum, t) => sum + t.members.length, 0);

  return (
    <div className="oic-page clamping-teams-page">
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
              <h1>Active Clamping Teams</h1>
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
              <p className="card-eyebrow">
                {totalLeads} Clamping Leaders · {totalOfficers} Enforcement
                Officers
              </p>
              <h2 className="card-title" style={{ marginBottom: 20 }}>
                Clamping Teams
              </h2>

              {loading ? (
                <div className="table-loading">
                  <p>Loading clamping teams...</p>
                </div>
              ) : teams.length === 0 ? (
                <div className="teams-empty">No clamping teams yet.</div>
              ) : (
                <div className="team-grid">
                  {teams.map((team) => (
                    <div
                      key={team.id}
                      className="team-card"
                      onClick={() => setEditingTeam(team)}
                    >
                      <div className="team-card-header">
                        <h3 className="team-card-name">{team.name}</h3>
                        <span
                          className={`status-pill ${getStatusClass(
                            team.status
                          )}`}
                        >
                          {team.status}
                        </span>
                      </div>

                      <div className="team-card-info">
                        <div className="team-card-line">
                          <Users size={14} className="team-card-icon" />
                          Lead: {team.lead}
                        </div>
                        <div className="team-card-line">
                          <MapPin size={14} className="team-card-icon" />
                          {team.area}
                        </div>
                      </div>

                      <div className="team-card-members">
                        {team.members.map((m) => (
                          <span key={m} className="team-member-pill">
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {editingTeam && (
        <TeamStatusModal
          team={editingTeam}
          officerName={currentUser.name}
          onClose={() => setEditingTeam(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   STATUS MODAL
------------------------------------------------------------------ */
type TeamStatusModalProps = {
  team: Team;
  officerName: string;
  onClose: () => void;
};

function TeamStatusModal({ team, officerName, onClose }: TeamStatusModalProps) {
  const [status, setStatus] = useState<TeamStatus>(team.status);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, "clampingTeams", team.id), {
        status,
        updatedAt: serverTimestamp(),
        updatedBy: officerName,
      });
      onClose();
    } catch (err: any) {
      console.error("Failed to update team status:", err);
      alert(err.message || "Failed to update team status.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={isSaving ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{team.name}</h2>
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
          <div className="team-info-box">
            <div>
              <span className="team-info-label">Lead:</span> {team.lead}
            </div>
            <div>
              <span className="team-info-label">Members:</span>{" "}
              {team.members.length > 0 ? team.members.join(", ") : "—"}
            </div>
            <div>
              <span className="team-info-label">Area:</span> {team.area}
            </div>
          </div>

          <div className="form-section">
            <label className="form-label">Update Status</label>
            <div className="form-dropdown" ref={menuRef}>
              <button
                type="button"
                className="form-dropdown-trigger"
                onClick={() => setIsOpen((o) => !o)}
                disabled={isSaving}
              >
                <span>{status}</span>
                <ChevronDown size={16} className="form-dropdown-chevron" />
              </button>

              {isOpen && (
                <div className="form-dropdown-menu">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={`form-dropdown-item${
                        status === opt ? " is-selected" : ""
                      }`}
                      onClick={() => {
                        setStatus(opt);
                        setIsOpen(false);
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}