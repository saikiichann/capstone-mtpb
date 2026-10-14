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
  Plus,
  X,
  ChevronDown,
  Loader2,
  QrCode,
  Pencil,
} from "lucide-react";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  serverTimestamp,
  query,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth, db, firebaseConfig } from "../../firebase";
import "./ITAdminHomepage.css";
import "./UserManagement.css";

import logo from "../../assets/mtpb-logo.png";
import avatarImg from "../../assets/user.png";
import logoutIcon from "../../assets/logout.png";
import keyIcon from "../../assets/key.png";

/* ------------------------------------------------------------------
   TYPES
------------------------------------------------------------------ */
type NavItem = {
  label: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  path: string;
  active?: boolean;
};

type NavGroup = { title: string; items: NavItem[] };

type RoleSlug =
  | "oic"
  | "it-admin"
  | "supervisor"
  | "record-officer"
  | "release-officer"
  | "finance"
  | "clamping-staff"
  | "impounding-staff";

type UserStatus = "active" | "inactive" | "suspended";

// ⚠️ WALANG "Both" — dalawa lang
type AssignedLocation = "City Hall" | "MTPB Central Market Impounding Area";

type UserRow = {
  uid: string;
  name: string;
  username: string;
  email: string;
  role: RoleSlug;
  status: UserStatus;
  lastLogin: Timestamp | null;
  assignedLocation: AssignedLocation | null;
};

type CurrentUser = { name: string; role: RoleSlug };

/* ------------------------------------------------------------------
   NORMALIZE STATUS
------------------------------------------------------------------ */
const normalizeStatus = (raw: any): UserStatus => {
  const val = String(raw ?? "active").toLowerCase().trim();
  if (val === "inactive" || val === "disabled" || val === "deactivated") return "inactive";
  if (val === "suspended") return "suspended";
  return "active";
};

/* ------------------------------------------------------------------
   CONFIG
------------------------------------------------------------------ */
const ROLES: { slug: RoleSlug; label: string; class: string }[] = [
  { slug: "oic", label: "Officer-in-Charge", class: "role-oic" },
  { slug: "supervisor", label: "Supervisor", class: "role-supervisor" },
  { slug: "record-officer", label: "Record Officer", class: "role-record" },
  { slug: "release-officer", label: "Release Officer", class: "role-release" },
  { slug: "finance", label: "Finance", class: "role-finance" },
  { slug: "clamping-staff", label: "Clamping Staff", class: "role-clamping" },
  { slug: "impounding-staff", label: "Impounding Staff", class: "role-impounding" },
  { slug: "it-admin", label: "IT Admin", class: "role-it" },
];

const STATUSES: { slug: UserStatus; label: string; class: string }[] = [
  { slug: "active", label: "Active", class: "status-active" },
  { slug: "inactive", label: "Inactive", class: "status-inactive" },
  { slug: "suspended", label: "Suspended", class: "status-suspended" },
];

// ⚠️ WALANG "Both"
const LOCATION_OPTIONS: { slug: AssignedLocation; label: string }[] = [
  { slug: "City Hall", label: "City Hall" },
  { slug: "MTPB Central Market Impounding Area", label: "MTPB Central Market Impounding Area" },
];

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

const roleLabel = (slug: RoleSlug) => ROLES.find((r) => r.slug === slug)?.label ?? slug;
const roleClass = (slug: RoleSlug) => ROLES.find((r) => r.slug === slug)?.class ?? "";
const statusLabel = (slug: UserStatus) => STATUSES.find((s) => s.slug === slug)?.label ?? slug;
const statusClass = (slug: UserStatus) => STATUSES.find((s) => s.slug === slug)?.class ?? "";

/* ------------------------------------------------------------------
   NAV
------------------------------------------------------------------ */
const navGroups: NavGroup[] = [
  {
    title: "Dashboard",
    items: [{ label: "Overview", icon: LayoutDashboard, path: "/it-admin" }],
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
      { label: "User Management", icon: Users, path: "/it-admin/users", active: true },
      { label: "Roles & Permissions", icon: ShieldCheck, path: "/it-admin/roles" },
      { label: "Session Monitor", icon: Monitor, path: "/it-admin/sessions" },
    ],
  },
  {
    title: "Enforcement Tools",
    items: [{ label: "QR Codes", icon: QrCode, path: "/it-admin/qr-codes" }],
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
    items: [{ label: "Settings", icon: Settings, path: "/it-admin/settings" }],
  },
];

/* ------------------------------------------------------------------
   HELPERS
------------------------------------------------------------------ */
const formatLastLogin = (ts: Timestamp | null): string => {
  if (!ts) return "Never";
  try {
    const date = ts.toDate();
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return isToday
      ? `Today ${time}`
      : `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${time}`;
  } catch {
    return "Never";
  }
};

/* ------------------------------------------------------------------
   ADD USER MODAL
------------------------------------------------------------------ */
type AddUserModalProps = {
  onClose: () => void;
  onSave: () => void;
  currentUserId: string;
};

function AddUserModal({ onClose, onSave, currentUserId }: AddUserModalProps) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<RoleSlug | "">("");
  const [password, setPassword] = useState("");
  const [assignedLocation, setAssignedLocation] = useState<AssignedLocation | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setError("");
    if (!name || !username || !role || !password) {
      setError("Please fill in all fields.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (!/^[a-z0-9.]+$/.test(username)) {
      setError("Username can only contain lowercase letters, numbers, and dots.");
      return;
    }
    if (role === "finance" && !assignedLocation) {
      setError("Please select an assigned location for Finance Staff.");
      return;
    }

    setSaving(true);
    try {
      const email = `${username}@mtpb.gov.ph`;
      const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);

      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const newUid = userCredential.user.uid;

      await secondaryAuth.signOut();
      await deleteApp(secondaryApp);

      await setDoc(doc(db, "users", newUid), {
        name: name.trim(),
        username: username.trim(),
        email,
        role,
        status: "active",
        lastLogin: null,
        ...(role === "finance" ? { assignedLocation } : {}),
        createdAt: serverTimestamp(),
        createdBy: currentUserId,
      });

      onSave();
    } catch (err: any) {
      if (err.code === "auth/email-already-in-use") {
        setError("Username already exists. Please choose another.");
      } else if (err.code === "auth/weak-password") {
        setError("Password is too weak. Use at least 6 characters.");
      } else if (err.code === "permission-denied") {
        setError("Permission denied. Please check your Firestore rules.");
      } else {
        setError(err.message || "Failed to create user.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={saving ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Add New User</h2>
          <button type="button" className="modal-close" onClick={onClose} disabled={saving}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-field">
            <label htmlFor="add-name">Name</label>
            <input
              id="add-name"
              type="text"
              placeholder="e.g. Juan Dela Cruz"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="add-username">Username</label>
              <input
                id="add-username"
                type="text"
                placeholder="e.g. j.delacruz"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
                disabled={saving}
              />
            </div>
            <div className="form-field">
              <label htmlFor="add-role">Role</label>
              <div className="select-wrap">
                <select
                  id="add-role"
                  value={role}
                  onChange={(e) => {
                    const newRole = e.target.value as RoleSlug;
                    setRole(newRole);
                    if (newRole !== "finance") {
                      setAssignedLocation("");
                    }
                  }}
                  disabled={saving}
                >
                  <option value="" disabled>Role</option>
                  {ROLES.map((r) => (
                    <option key={r.slug} value={r.slug}>{r.label}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="select-icon" />
              </div>
            </div>
          </div>

          {role === "finance" && (
            <div className="form-field">
              <label htmlFor="add-location">Assigned Location *</label>
              <div className="select-wrap">
                <select
                  id="add-location"
                  value={assignedLocation}
                  onChange={(e) => setAssignedLocation(e.target.value as AssignedLocation)}
                  disabled={saving}
                >
                  <option value="" disabled>Select location...</option>
                  {LOCATION_OPTIONS.map((loc) => (
                    <option key={loc.slug} value={loc.slug}>{loc.label}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="select-icon" />
              </div>
            </div>
          )}

          <div className="form-field">
            <label htmlFor="add-password">Temporary Password</label>
            <input
              id="add-password"
              type="text"
              placeholder="Must be change on first login"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={saving}
            />
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
   EDIT USER MODAL
------------------------------------------------------------------ */
type EditUserModalProps = {
  user: UserRow;
  onClose: () => void;
  onSave: () => void;
};

function EditUserModal({ user, onClose, onSave }: EditUserModalProps) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<RoleSlug>(user.role);
  const [status, setStatus] = useState<UserStatus>(user.status);
  const [assignedLocation, setAssignedLocation] = useState<AssignedLocation | "">(
    user.assignedLocation ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setError("");
    if (!name || !role || !status) {
      setError("Please fill in all fields.");
      return;
    }
    if (role === "finance" && !assignedLocation) {
      setError("Please select an assigned location for Finance Staff.");
      return;
    }

    setSaving(true);
    try {
      const userDocRef = doc(db, "users", user.uid);

      const updateData: any = {
        name: name.trim(),
        role,
        status,
        updatedAt: serverTimestamp(),
      };

      if (role === "finance") {
        updateData.assignedLocation = assignedLocation;
      } else {
        updateData.assignedLocation = null;
      }

      await updateDoc(userDocRef, updateData);
      onSave();
    } catch (err: any) {
      if (err.code === "permission-denied") {
        setError("Permission denied. Please check your Firestore rules.");
      } else {
        setError(err.message || "Failed to update user.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={saving ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Edit User: {user.name}</h2>
          <button type="button" className="modal-close" onClick={onClose} disabled={saving}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-field">
            <label htmlFor="edit-name">Name</label>
            <input
              id="edit-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="form-field">
            <label htmlFor="edit-username">Username (cannot be changed)</label>
            <input
              id="edit-username"
              type="text"
              value={user.username}
              disabled
              style={{ background: "#F3F4F6", cursor: "not-allowed", color: "#6B7280" }}
            />
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="edit-role">Role</label>
              <div className="select-wrap">
                <select
                  id="edit-role"
                  value={role}
                  onChange={(e) => {
                    const newRole = e.target.value as RoleSlug;
                    setRole(newRole);
                    if (newRole !== "finance") {
                      setAssignedLocation("");
                    }
                  }}
                  disabled={saving}
                >
                  {ROLES.map((r) => (
                    <option key={r.slug} value={r.slug}>{r.label}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="select-icon" />
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="edit-status">Status</label>
              <div className="select-wrap">
                <select
                  id="edit-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as UserStatus)}
                  disabled={saving}
                >
                  {STATUSES.map((s) => (
                    <option key={s.slug} value={s.slug}>{s.label}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="select-icon" />
              </div>
            </div>
          </div>

          {role === "finance" && (
            <div className="form-field">
              <label htmlFor="edit-location">Assigned Location *</label>
              <div className="select-wrap">
                <select
                  id="edit-location"
                  value={assignedLocation}
                  onChange={(e) => setAssignedLocation(e.target.value as AssignedLocation)}
                  disabled={saving}
                >
                  <option value="" disabled>Select location...</option>
                  {LOCATION_OPTIONS.map((loc) => (
                    <option key={loc.slug} value={loc.slug}>{loc.label}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="select-icon" />
              </div>
            </div>
          )}

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
   DISABLE/ENABLE CONFIRM MODAL
------------------------------------------------------------------ */
type DisableModalProps = {
  user: UserRow;
  mode: "disable" | "enable";
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
};

function DisableModal({ user, mode, onClose, onConfirm, loading }: DisableModalProps) {
  const isDisable = mode === "disable";

  return (
    <div className="modal-backdrop" onClick={loading ? undefined : onClose}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-modal-body">
          <h3 className="confirm-modal-title">
            {isDisable ? "Disable this account?" : "Enable this account?"}
          </h3>
          <p className="confirm-modal-text">
            <strong>{user.name}</strong> ({user.username}) will{" "}
            {isDisable ? "no longer be able to log in until re-enabled" : "be able to log in again"}.
            Their past activity and audit trail will be kept.
          </p>
        </div>

        <div className="confirm-modal-footer">
          <button
            type="button"
            className="btn-cancel"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            className={isDisable ? "btn-danger" : "btn-success"}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <><Loader2 size={14} className="spin" /> {isDisable ? "Disabling..." : "Enabling..."}</>
            ) : (
              isDisable ? "Disable" : "Enable"
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
export default function UserManagement() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [confirmUser, setConfirmUser] = useState<{ user: UserRow; mode: "disable" | "enable" } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(8);

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "it-admin",
  });

  const menuRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

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

  useEffect(() => {
    const usersQuery = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      usersQuery,
      (snapshot) => {
        const fetchedUsers: UserRow[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            uid: d.id,
            name: data.name ?? "",
            username: data.username ?? "",
            email: data.email ?? "",
            role: (data.role ?? "oic") as RoleSlug,
            status: normalizeStatus(data.status),
            lastLogin: data.lastLogin ?? null,
            assignedLocation: (data.assignedLocation as AssignedLocation) ?? null,
          };
        });
        setUsers(fetchedUsers);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching users:", error);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setIsAddModalOpen(false);
        setEditingUser(null);
        setConfirmUser(null);
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

  const handleConfirmToggle = async () => {
    if (!confirmUser) return;
    setActionLoading(true);

    try {
      const newStatus: UserStatus = confirmUser.mode === "disable" ? "inactive" : "active";
      await updateDoc(doc(db, "users", confirmUser.user.uid), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(collection(db, "auditLogs")), {
        userName: currentUser.name,
        action: `${confirmUser.mode === "disable" ? "disabled" : "enabled"} account ${confirmUser.user.username}`,
        record: confirmUser.user.username,
        type: "user-management",
        timestamp: serverTimestamp(),
      });

      setConfirmUser(null);
    } catch (err: any) {
      console.error("Error toggling user status:", err);
      alert(err.message || "Failed to update user status.");
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(users.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedUsers = users.slice(startIndex, endIndex);

  const goToPrevPage = () => setCurrentPage((p) => Math.max(1, p - 1));
  const goToNextPage = () => setCurrentPage((p) => Math.min(totalPages, p + 1));

  return (
    <div className="it-admin-page">
      <div className="dashboard">
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

        <main className="main">
          <header className="main-header">
            <div>
              <h1>User Management</h1>
              <p>{new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
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
                  <button type="button" className="dropdown-item" onClick={() => setMenuOpen(false)}>
                    <img src={keyIcon} alt="" className="dropdown-icon" />
                    <span>Change Password</span>
                  </button>
                  <button type="button" className="dropdown-item logout" onClick={handleLogout}>
                    <img src={logoutIcon} alt="" className="dropdown-icon" />
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </div>
          </header>

          <div className="main-content">
            <div className="user-mgmt-header">
              <p className="user-mgmt-count">
                <strong>Staff accounts:</strong> {users.length} total
              </p>
              <button
                type="button"
                className="btn-add-user"
                onClick={() => setIsAddModalOpen(true)}
              >
                <Plus size={16} />
                Add User
              </button>
            </div>

            <div className="card user-table-card">
              {loading ? (
                <div className="table-loading">
                  <Loader2 size={24} className="spin" />
                  <p>Loading users...</p>
                </div>
              ) : users.length === 0 ? (
                <div className="table-empty">
                  <p>No users found. Click "Add User" to create one.</p>
                </div>
              ) : (
                <>
                  <table className="user-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Username</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Last login</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedUsers.map((user) => {
                        const normalizedStatus = normalizeStatus(user.status);
                        const isActive = normalizedStatus === "active";

                        return (
                          <tr key={user.uid}>
                            <td className="cell-name">{user.name}</td>
                            <td className="cell-username">{user.username}</td>

                            {/* ⚠️ CHANGED: Role pill + location sa TABI (inline) */}
                            <td>
                              <div className="role-cell-content">
                                <span className={`role-pill ${roleClass(user.role)}`}>
                                  {roleLabel(user.role)}
                                </span>
                                {user.role === "finance" && user.assignedLocation && (
                                  <span className="location-inline">
                                    — {user.assignedLocation}
                                  </span>
                                )}
                              </div>
                            </td>

                            <td>
                              <span className={`status-pill ${statusClass(normalizedStatus)}`}>
                                {statusLabel(normalizedStatus)}
                              </span>
                            </td>
                            <td className="cell-last-login">{formatLastLogin(user.lastLogin)}</td>
                            <td className="cell-action">
                              {isActive ? (
                                <button
                                  type="button"
                                  className="btn-disable"
                                  onClick={() => setConfirmUser({ user, mode: "disable" })}
                                >
                                  Disable
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn-enable"
                                  onClick={() => setConfirmUser({ user, mode: "enable" })}
                                >
                                  Enable
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn-icon-edit"
                                onClick={() => setEditingUser(user)}
                                aria-label={`Edit ${user.name}`}
                              >
                                <Pencil size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="pagination">
                    <button
                      type="button"
                      className="page-btn"
                      onClick={goToPrevPage}
                      disabled={currentPage === 1}
                    >
                      ‹ Previous
                    </button>

                    <input
                      type="number"
                      className="page-input"
                      value={currentPage}
                      min={1}
                      max={totalPages}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (val >= 1 && val <= totalPages) setCurrentPage(val);
                      }}
                    />
                    <span className="page-total">of {totalPages} pages</span>

                    <button
                      type="button"
                      className="page-btn"
                      onClick={goToNextPage}
                      disabled={currentPage === totalPages}
                    >
                      Next ›
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </main>
      </div>

      {isAddModalOpen && auth.currentUser && (
        <AddUserModal
          onClose={() => setIsAddModalOpen(false)}
          onSave={() => setIsAddModalOpen(false)}
          currentUserId={auth.currentUser.uid}
        />
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSave={() => setEditingUser(null)}
        />
      )}

      {confirmUser && (
        <DisableModal
          user={confirmUser.user}
          mode={confirmUser.mode}
          onClose={() => setConfirmUser(null)}
          onConfirm={handleConfirmToggle}
          loading={actionLoading}
        />
      )}
    </div>
  );
}