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
  KeyRound,
  CheckCircle,
  Eye,
  EyeOff,
  QrCode,
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
  signInWithEmailAndPassword,
  updatePassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth, db, firebaseConfig } from "../../firebase";
import "./ITAdminHomePage.css";
import "./UserManagement.css";

import logo from "../../assets/mtpb-logo.png";
import avatarImg from "../../assets/user.png";
import logoutIcon from "../../assets/logout.png";
import keyIcon from "../../assets/key.png";
import editIcon from "../../assets/edit-text.png";

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

type UserStatus = "active" | "inactive" | "suspended";

type UserRow = {
  uid: string;
  name: string;
  username: string;
  email: string;
  role: RoleSlug;
  status: UserStatus;
  lastLogin: Timestamp | null;
};

type CurrentUser = {
  name: string;
  role: RoleSlug;
};

/* ------------------------------------------------------------------
   ROLE / STATUS CONFIG
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
      { label: "User Management", icon: Users, path: "/it-admin/users", active: true },
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
   DATE HELPER
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

    setSaving(true);

    try {
      const email = `${username}@mtpb.gov.ph`;

      const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);

      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        email,
        password
      );
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
        createdAt: serverTimestamp(),
        createdBy: currentUserId,
      });

      console.log("User created successfully:", newUid);
      onSave();
    } catch (err: any) {
      console.error("Error creating user:", err);
      if (err.code === "auth/email-already-in-use") {
        setError("Username already exists. Please choose another.");
      } else if (err.code === "auth/weak-password") {
        setError("Password is too weak. Use at least 6 characters.");
      } else if (err.code === "permission-denied" || err.message?.includes("insufficient permissions")) {
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
                  onChange={(e) => setRole(e.target.value as RoleSlug)}
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const handleSave = async () => {
    setError("");

    if (!name || !role || !status) {
      setError("Please fill in all fields.");
      return;
    }

    setSaving(true);

    try {
      const userDocRef = doc(db, "users", user.uid);
      await updateDoc(userDocRef, {
        name: name.trim(),
        role,
        status,
        updatedAt: serverTimestamp(),
      });

      console.log("User updated:", user.uid);
      onSave();
    } catch (err: any) {
      console.error("Error updating user:", err);
      if (err.code === "permission-denied" || err.message?.includes("insufficient permissions")) {
        setError("Permission denied. Please check your Firestore rules.");
      } else {
        setError(err.message || "Failed to update user.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError("");
    setPasswordChanged(false);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Please fill in all password fields.");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordError("New password must be different from current password.");
      return;
    }

    setChangingPassword(true);

    try {
      const secondaryApp = initializeApp(firebaseConfig, `edit-${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);

      const userCredential = await signInWithEmailAndPassword(
        secondaryAuth,
        user.email,
        currentPassword
      );

      await updatePassword(userCredential.user, newPassword);

      await secondaryAuth.signOut();
      await deleteApp(secondaryApp);

      console.log("Password updated for:", user.email);
      setPasswordChanged(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setTimeout(() => setPasswordChanged(false), 5000);
    } catch (err: any) {
      console.error("Error changing password:", err);
      await deleteApp(initializeApp(firebaseConfig, `cleanup-${Date.now()}`)).catch(() => {});

      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setPasswordError("Current password is incorrect.");
      } else if (err.code === "auth/weak-password") {
        setPasswordError("New password is too weak.");
      } else if (err.code === "auth/too-many-requests") {
        setPasswordError("Too many attempts. Please try again later.");
      } else {
        setPasswordError(err.message || "Failed to change password.");
      }
    } finally {
      setChangingPassword(false);
    }
  };

  const isBusy = saving || changingPassword;

  return (
    <div className="modal-backdrop" onClick={isBusy ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Edit User: {user.name}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={isBusy}
            aria-label="Close"
          >
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
              disabled={isBusy}
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
                  onChange={(e) => setRole(e.target.value as RoleSlug)}
                  disabled={isBusy}
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
                  disabled={isBusy}
                >
                  {STATUSES.map((s) => (
                    <option key={s.slug} value={s.slug}>{s.label}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="select-icon" />
              </div>
            </div>
          </div>

          <button
            type="button"
            className="password-toggle-btn"
            onClick={() => setShowPasswordSection(!showPasswordSection)}
            disabled={isBusy}
          >
            <KeyRound size={16} />
            <span>{showPasswordSection ? "Hide" : "Change"} Password</span>
            <ChevronDown
              size={16}
              style={{
                transform: showPasswordSection ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}
            />
          </button>

          {showPasswordSection && (
            <div className="password-reset-box">
              <div className="password-reset-header">
                <h3>Change Password</h3>
                <p>
                  Enter the user's <strong>current password</strong> and the{" "}
                  <strong>new password</strong> you want to set.
                </p>
              </div>

              <div className="form-field">
                <label htmlFor="current-password">Current Password</label>
                <div className="input-with-icon">
                  <input
                    id="current-password"
                    type={showCurrent ? "text" : "password"}
                    placeholder="User's current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    disabled={isBusy}
                  />
                  <button
                    type="button"
                    className="password-eye"
                    onClick={() => setShowCurrent(!showCurrent)}
                    tabIndex={-1}
                  >
                    {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="new-password">New Password</label>
                <div className="input-with-icon">
                  <input
                    id="new-password"
                    type={showNew ? "text" : "password"}
                    placeholder="At least 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isBusy}
                  />
                  <button
                    type="button"
                    className="password-eye"
                    onClick={() => setShowNew(!showNew)}
                    tabIndex={-1}
                  >
                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="confirm-password">Confirm New Password</label>
                <input
                  id="confirm-password"
                  type="password"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isBusy}
                />
              </div>

              {passwordError && <p className="reset-error">{passwordError}</p>}

              <button
                type="button"
                className={`btn-reset-password${passwordChanged ? " success" : ""}`}
                onClick={handleChangePassword}
                disabled={isBusy}
              >
                {changingPassword ? (
                  <>
                    <Loader2 size={16} className="spin" />
                    Changing...
                  </>
                ) : passwordChanged ? (
                  <>
                    <CheckCircle size={16} />
                    Password Changed!
                  </>
                ) : (
                  <>
                    <KeyRound size={16} />
                    Update Password
                  </>
                )}
              </button>
            </div>
          )}

          {error && <p className="modal-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-cancel" onClick={onClose} disabled={isBusy}>
            Cancel
          </button>
          <button type="button" className="btn-save" onClick={handleSave} disabled={isBusy}>
            {saving ? <><Loader2 size={14} className="spin" /> Saving...</> : "Save Changes"}
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
            status: (data.status ?? "active") as UserStatus,
            lastLogin: data.lastLogin ?? null,
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
              <p>May 3, 2026</p>
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
                <table className="user-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Username</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Last login</th>
                      <th aria-label="Actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.uid}>
                        <td className="cell-name">{user.name}</td>
                        <td className="cell-username">{user.username}</td>
                        <td>
                          <span className={`role-pill ${roleClass(user.role)}`}>
                            {roleLabel(user.role)}
                          </span>
                        </td>
                        <td>
                          <span className={`status-pill ${statusClass(user.status)}`}>
                            {statusLabel(user.status)}
                          </span>
                        </td>
                        <td className="cell-last-login">{formatLastLogin(user.lastLogin)}</td>
                        <td className="cell-action">
                          <button
                            type="button"
                            className="edit-btn"
                            onClick={() => setEditingUser(user)}
                            aria-label={`Edit ${user.name}`}
                          >
                            <img
                              src={editIcon}
                              alt="Edit"
                              className="edit-icon"
                            />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
    </div>
  );
}