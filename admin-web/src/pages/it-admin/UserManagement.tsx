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
  Plus,
  X,
  ChevronDown,
  Loader2,
  QrCode,
  Pencil,
  KeyRound,
  Star,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { CLAMPING_DISTRICT, clampingTeamRef, useClampingTeam } from "../../lib/clampingTeam";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db, firebaseConfig } from "../../firebase";
import { ResetPasswordDialog, ResetRequestsPanel, type ResetTarget } from "./PasswordReset";
import { generateTempPassword } from "../../lib/tempPassword";
import "./ITAdminHomepage.css";
import "./UserManagement.css";

import AppTopbar from "../../components/AppTopbar";
import AppSidebar from "../../components/AppSidebar";
import { clientIp } from "../../lib/staffSession";

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

type AssignedLocation = "City Hall" | "MTPB Central";

type UserRow = {
  uid: string;
  name: string;
  username: string;
  email: string;
  role: RoleSlug;
  status: UserStatus;
  lastLogin: Timestamp | null;
  assignedLocation: AssignedLocation | null;
  /** Clamping Staff only: always District 3 (the one district the system covers). */
  assignedDistrict: string | null;
  /** Clamping Staff only: the one clamping team leader of District 3. */
  isTeamLeader: boolean;
};

type CurrentUser = { name: string; role: RoleSlug };

/* ------------------------------------------------------------------
   NORMALIZE STATUS
------------------------------------------------------------------ */
const normalizeStatus = (raw: unknown): UserStatus => {
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

const LOCATION_OPTIONS: { slug: AssignedLocation; label: string }[] = [
  { slug: "City Hall", label: "City Hall" },
  { slug: "MTPB Central", label: "MTPB Central" },
];

/* The system covers one district only, so every Clamping Staff is in
   District 3 and there is one team leader for the whole district
   (CLAMPING_DISTRICT, from lib/clampingTeam). */


const roleLabel = (slug: RoleSlug) => ROLES.find((r) => r.slug === slug)?.label ?? slug;
const roleClass = (slug: RoleSlug) => ROLES.find((r) => r.slug === slug)?.class ?? "";
const statusLabel = (slug: UserStatus) => STATUSES.find((s) => s.slug === slug)?.label ?? slug;
const statusClass = (slug: UserStatus) => STATUSES.find((s) => s.slug === slug)?.class ?? "";

/* ------------------------------------------------------------------
   ROLE REGISTRY HELPERS
   Para sa notification dispatch (roleRegistry/{role}/users/{uid}).
   Walang sensitive info — name + active flag lang.
------------------------------------------------------------------ */
const syncRoleRegistry = async (
  uid: string,
  name: string,
  role: RoleSlug,
  active: boolean
): Promise<void> => {
  await setDoc(
    doc(db, "roleRegistry", role, "users", uid),
    {
      name: name.trim(),
      active,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};

const removeFromRoleRegistry = async (uid: string, role: RoleSlug): Promise<void> => {
  try {
    await deleteDoc(doc(db, "roleRegistry", role, "users", uid));
  } catch (err) {
    console.warn("Failed to remove from roleRegistry:", err);
  }
};

/* ------------------------------------------------------------------
   CLAMPING TEAM HELPERS
   Isang leader lang para sa buong District 3. Kapag may bagong leader,
   tinatanggal ang leader status ng dati (sa iisang batch, para sabay).
------------------------------------------------------------------ */
const isClampLeader = (u: UserRow) => u.role === "clamping-staff" && u.isTeamLeader;

const currentLeader = (users: UserRow[], exceptUid: string | null): UserRow | undefined =>
  users.find((u) => isClampLeader(u) && u.uid !== exceptUid);

/** Leader(s) to step down when `uid` becomes the District 3 leader. */
const leadersToReplace = (users: UserRow[], uid: string): UserRow[] =>
  users.filter((u) => isClampLeader(u) && u.uid !== uid);

/** District + leader fields, shown only when the role is Clamping Staff. */
function ClampingTeamFields({
  idPrefix,
  isLeader,
  setIsLeader,
  users,
  selfUid,
  disabled,
}: {
  idPrefix: string;
  isLeader: boolean;
  setIsLeader: (value: boolean) => void;
  users: UserRow[];
  selfUid: string | null;
  disabled: boolean;
}) {
  const current = currentLeader(users, selfUid);
  return (
    <>
      <div className="form-field">
        <label htmlFor={`${idPrefix}-district`}>Assigned District</label>
        <input
          id={`${idPrefix}-district`}
          type="text"
          value={CLAMPING_DISTRICT}
          readOnly
          disabled
        />
      </div>

      <div className="form-field team-leader-field">
        <label className="team-leader-check" htmlFor={`${idPrefix}-leader`}>
          <input
            id={`${idPrefix}-leader`}
            type="checkbox"
            checked={isLeader}
            onChange={(e) => setIsLeader(e.target.checked)}
            disabled={disabled}
          />
          <span>Clamping team leader of {CLAMPING_DISTRICT}</span>
        </label>
        <p className="team-leader-note">
          {current
            ? isLeader
              ? `${current.name} is the current leader and will be changed to a member.`
              : `Current leader: ${current.name}.`
            : `${CLAMPING_DISTRICT} has no team leader yet.`}
        </p>
      </div>
    </>
  );
}

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
  users: UserRow[];
};

function AddUserModal({ onClose, onSave, currentUserId, users }: AddUserModalProps) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<RoleSlug | "">("");
  // Random temporary password (lib/tempPassword.ts); the person sets their own at first login.
  const [password, setPassword] = useState(generateTempPassword);
  /** After saving: the account that was made, to show its password once. */
  const [created, setCreated] = useState<{ name: string; username: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [assignedLocation, setAssignedLocation] = useState<AssignedLocation | "">("");
  const assignedDistrict = CLAMPING_DISTRICT;
  const [isTeamLeader, setIsTeamLeader] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setError("");
    if (!name || !username || !role || !password) {
      setError("Please fill in all fields.");
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

      // 1. Save sa users collection
      await setDoc(doc(db, "users", newUid), {
        name: name.trim(),
        username: username.trim(),
        email,
        role,
        status: "active",
        lastLogin: null,
        // Temporary password: they must set their own at the first login.
        mustChangePassword: true,
        ...(role === "finance" ? { assignedLocation } : {}),
        ...(role === "clamping-staff" ? { assignedDistrict, isTeamLeader } : {}),
        createdAt: serverTimestamp(),
        createdBy: currentUserId,
      });

      // 1b. One leader for District 3: the previous leader becomes a member.
      const replaced =
        role === "clamping-staff" && isTeamLeader
          ? leadersToReplace(users, newUid)
          : [];
      if (replaced.length > 0) {
        const batch = writeBatch(db);
        replaced.forEach((u) =>
          batch.update(doc(db, "users", u.uid), { isTeamLeader: false, updatedAt: serverTimestamp() })
        );
        await batch.commit();
      }

      // 2. Sync sa roleRegistry (para sa notification dispatch)
      await syncRoleRegistry(newUid, name.trim(), role, true);

      // 3. Audit log
      try {
        await setDoc(doc(collection(db, "auditLogs")), {
          userName: "IT Admin",
          userRole: "it-admin",
          action: `created user ${username.trim()} (${role})`,
          record: username.trim(),
          type: "user-management",
          metadata: {
            uid: newUid,
            role,
            assignedLocation: assignedLocation || null,
            assignedDistrict: role === "clamping-staff" ? assignedDistrict : null,
            isTeamLeader: role === "clamping-staff" ? isTeamLeader : false,
            replacedLeader: replaced.map((u) => u.username || u.name),
          },
          timestamp: serverTimestamp(),
          ipAddress: clientIp(),
        });
      } catch (auditErr) {
        console.warn("Audit log not written:", auditErr);
      }

      setCreated({ name: name.trim(), username: username.trim() });
    } catch (err) {
      if ((err as { code?: string })?.code === "auth/email-already-in-use") {
        setError("Username already exists. Please choose another.");
      } else if ((err as { code?: string })?.code === "auth/weak-password") {
        setPassword(generateTempPassword());
        setError("Password was rejected. A new one was generated; please try again.");
      } else if ((err as { code?: string })?.code === "permission-denied") {
        setError("Permission denied. Please check your Firestore rules.");
      } else {
        setError((err as Error)?.message || "Failed to create user.");
      }
    } finally {
      setSaving(false);
    }
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the password is on screen to read out.
    }
  };

  if (created) {
    return (
      <div className="modal-backdrop">
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="created-title">
          <div className="modal-header">
            <h2 id="created-title" className="modal-title">Account created</h2>
          </div>
          <div className="modal-body">
            <p className="temp-pass-note">
              Give this temporary password to <strong>{created.name}</strong> ({created.username}) in
              person or by phone. It is shown only once.
            </p>
            <div className="temp-pass-box">
              <code>{password}</code>
              <button type="button" className="temp-pass-btn" onClick={() => void copyPassword()}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="temp-pass-note temp-pass-muted">
              They'll log in with it and must set their own password right away.
            </p>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-save" onClick={onSave}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={saving ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Add New User</h2>
          <button aria-label="Close" type="button" className="modal-close" onClick={onClose} disabled={saving}>
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
                    if (newRole !== "clamping-staff") {
                      setIsTeamLeader(false);
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

          {role === "clamping-staff" && (
            <ClampingTeamFields
              idPrefix="add"
              isLeader={isTeamLeader}
              setIsLeader={setIsTeamLeader}
              users={users}
              selfUid={null}
              disabled={saving}
            />
          )}

          <div className="form-field">
            <label htmlFor="add-password">Temporary Password</label>
            <div className="temp-pass-row">
              <input
                id="add-password"
                type="text"
                value={password}
                readOnly
                aria-describedby="add-password-hint"
                className="temp-pass-input"
              />
              <button
                type="button"
                className="temp-pass-btn"
                onClick={() => setPassword(generateTempPassword())}
                disabled={saving}
                title="Generate another"
                aria-label="Generate another temporary password"
              >
                <RefreshCw size={15} />
              </button>
            </div>
            <small id="add-password-hint" className="temp-pass-hint">
              Generated automatically. They must change it at the first login.
            </small>
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
  users: UserRow[];
  onClose: () => void;
  onSave: () => void;
};

function EditUserModal({ user, users, onClose, onSave }: EditUserModalProps) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<RoleSlug>(user.role);
  const [status, setStatus] = useState<UserStatus>(user.status);
  const [assignedLocation, setAssignedLocation] = useState<AssignedLocation | "">(
    user.assignedLocation ?? ""
  );
  // Old records may still hold an area name; saving moves them to District 3.
  const assignedDistrict = CLAMPING_DISTRICT;
  const [isTeamLeader, setIsTeamLeader] = useState(user.isTeamLeader);
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

      const updateData: Record<string, unknown> = {
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

      if (role === "clamping-staff") {
        updateData.assignedDistrict = assignedDistrict;
        updateData.isTeamLeader = isTeamLeader;
      } else {
        updateData.assignedDistrict = null;
        updateData.isTeamLeader = false;
      }

      // One leader for District 3: this user's change and the previous
      // leader stepping down are saved together.
      const replaced =
        role === "clamping-staff" && isTeamLeader
          ? leadersToReplace(users, user.uid)
          : [];
      const batch = writeBatch(db);
      batch.update(userDocRef, updateData);
      replaced.forEach((u) =>
        batch.update(doc(db, "users", u.uid), { isTeamLeader: false, updatedAt: serverTimestamp() })
      );
      await batch.commit();

      // Sync sa roleRegistry
      const roleChanged = role !== user.role;
      const isActive = status === "active";

      if (roleChanged) {
        // Remove from lumang role, add sa bagong role
        await removeFromRoleRegistry(user.uid, user.role);
        if (isActive) {
          await syncRoleRegistry(user.uid, name.trim(), role, true);
        }
      } else {
        // Same role — i-update ang name at active flag
        await syncRoleRegistry(user.uid, name.trim(), role, isActive);
      }

      // Audit log
      try {
        await setDoc(doc(collection(db, "auditLogs")), {
          userName: "IT Admin",
          userRole: "it-admin",
          action: `updated user ${user.username} (role: ${role}, status: ${status})`,
          record: user.username,
          type: "user-management",
          metadata: {
            uid: user.uid,
            oldRole: user.role,
            newRole: role,
            oldStatus: user.status,
            newStatus: status,
            oldDistrict: user.assignedDistrict,
            newDistrict: role === "clamping-staff" ? assignedDistrict : null,
            oldTeamLeader: user.isTeamLeader,
            newTeamLeader: role === "clamping-staff" ? isTeamLeader : false,
            replacedLeader: replaced.map((u) => u.username || u.name),
          },
          timestamp: serverTimestamp(),
          ipAddress: clientIp(),
        });
      } catch (auditErr) {
        console.warn("Audit log not written:", auditErr);
      }

      onSave();
    } catch (err) {
      if ((err as { code?: string })?.code === "permission-denied") {
        setError("Permission denied. Please check your Firestore rules.");
      } else {
        setError((err as Error)?.message || "Failed to update user.");
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
          <button aria-label="Close" type="button" className="modal-close" onClick={onClose} disabled={saving}>
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
                    if (newRole !== "clamping-staff") {
                      setIsTeamLeader(false);
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

          {role === "clamping-staff" && (
            <ClampingTeamFields
              idPrefix="edit"
              isLeader={isTeamLeader}
              setIsLeader={setIsTeamLeader}
              users={users}
              selfUid={user.uid}
              disabled={saving}
            />
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
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [confirmUser, setConfirmUser] = useState<{ user: UserRow; mode: "disable" | "enable" } | null>(null);
  /** Staff password reset (PasswordReset.tsx) */
  const [resetTarget, setResetTarget] = useState<ResetTarget | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(8);

  /* Keep settings/clampingTeam in step with the leader picked here. Only the
     IT Admin can read users, so the OIC/Supervisor Operation Scheduler reads
     the leader from that settings doc. Runs after every users change (add,
     edit, rename), and also fixes it for a leader set before this existed. */
  const team = useClampingTeam();
  useEffect(() => {
    if (loading || team === null || users.length === 0) return;
    const leader = users.find(isClampLeader) ?? null;
    const leaderUid = leader?.uid ?? null;
    const leaderName = leader?.name ?? null;
    if (
      team.leaderUid === leaderUid &&
      team.leaderName === leaderName &&
      team.district === CLAMPING_DISTRICT
    ) {
      return;
    }
    setDoc(
      clampingTeamRef(),
      { district: CLAMPING_DISTRICT, leaderUid, leaderName, updatedAt: serverTimestamp() },
      { merge: true }
    ).catch((err) => console.warn("Clamping team sync failed:", err));
  }, [users, loading, team]);

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "it-admin",
  });


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
            assignedDistrict: (data.assignedDistrict as string) ?? null,
            isTeamLeader: data.isTeamLeader === true,
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

  const handleConfirmToggle = async () => {
    if (!confirmUser) return;
    setActionLoading(true);

    try {
      const newStatus: UserStatus = confirmUser.mode === "disable" ? "inactive" : "active";
      await updateDoc(doc(db, "users", confirmUser.user.uid), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      // Sync sa roleRegistry — i-update ang active flag
      await syncRoleRegistry(
        confirmUser.user.uid,
        confirmUser.user.name,
        confirmUser.user.role,
        newStatus === "active"
      );

      await setDoc(doc(collection(db, "auditLogs")), {
        userName: currentUser.name,
        action: `${confirmUser.mode === "disable" ? "disabled" : "enabled"} account ${confirmUser.user.username}`,
        record: confirmUser.user.username,
        type: "user-management",
        timestamp: serverTimestamp(),
        ipAddress: clientIp(),
      });

      setConfirmUser(null);
    } catch (err) {
      console.error("Error toggling user status:", err);
      alert((err as Error)?.message || "Failed to update user status.");
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
        <AppSidebar groups={navGroups} role={<>IT Admin</>} />

        <main className="main">
          <AppTopbar groups={navGroups} />
          <header className="main-header">
            <div>
              <h1>User Management</h1>
              <p>{new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
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

            <ResetRequestsPanel roleLabel={(r) => roleLabel(r as RoleSlug)} onReset={setResetTarget} />

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
                                {user.role === "clamping-staff" && (
                                  <span className="location-inline">
                                    — {CLAMPING_DISTRICT}
                                  </span>
                                )}
                                {user.role === "clamping-staff" && user.isTeamLeader && (
                                  <span className="leader-pill">
                                    <Star size={11} aria-hidden="true" />
                                    Leader
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
                              <div className="cell-action-buttons">
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
                              {user.uid !== auth.currentUser?.uid && (
                                <button
                                  type="button"
                                  className="um-reset-btn"
                                  onClick={() =>
                                    setResetTarget({
                                      uid: user.uid,
                                      name: user.name,
                                      username: user.username,
                                      role: user.role,
                                    })
                                  }
                                  aria-label={`Reset password of ${user.name}`}
                                  title="Reset password"
                                >
                                  <KeyRound size={14} />
                                </button>
                              )}
                              </div>
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
                      aria-label="Page number"
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
          users={users}
        />
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          users={users}
          onClose={() => setEditingUser(null)}
          onSave={() => setEditingUser(null)}
        />
      )}

      {resetTarget && (
        <ResetPasswordDialog target={resetTarget} onClose={() => setResetTarget(null)} />
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