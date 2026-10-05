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
  Settings as SettingsIcon,
  RefreshCw,
  Loader2,
  QrCode,
} from "lucide-react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./ITAdminHomePage.css";
import "./Settings.css";

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
  name: string;
  role: RoleSlug;
};

type FineRow = {
  id: string;
  violationType: string;
  amount: number;
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
      { label: "Settings", icon: SettingsIcon, path: "/it-admin/settings", active: true },
    ],
  },
];

/* ------------------------------------------------------------------
   FALLBACK DATA (kung walang Firestore data)
------------------------------------------------------------------ */
const FALLBACK_CLAMPING: FineRow[] = [
  { id: "clamping-blocking-driveway", violationType: "Blocking Driveway", amount: 1000 },
  { id: "clamping-blocking-pwd-lane", violationType: "Blocking PWD Lane", amount: 500 },
  { id: "clamping-blocking-fire-hydrant", violationType: "Blocking Fire Hydrant", amount: 1000 },
  { id: "clamping-complaint-area", violationType: "Complaint Area", amount: 500 },
  { id: "clamping-no-parking-zone", violationType: "No Parking Zone / Both Sides", amount: 1000 },
  { id: "clamping-blocking-pedestrian", violationType: "Blocking Pedestrian Lane", amount: 500 },
  { id: "clamping-blocking-fire-truck", violationType: "Blocking Fire Truck Lane", amount: 1000 },
  { id: "clamping-double-parking", violationType: "Double Parking", amount: 500 },
  { id: "clamping-sidewalk-parking", violationType: "Sidewalk Parking", amount: 500 },
  { id: "clamping-street-corner", violationType: "Street Corner Parking", amount: 1000 },
  { id: "clamping-left-side", violationType: "Left Side Parking / One Way Street", amount: 1000 },
  { id: "clamping-right-side", violationType: "Right Side Parking / One Way Street", amount: 500 },
  { id: "clamping-bridge-top", violationType: "Top of the Bridge Parking", amount: 1000 },
  { id: "clamping-obstruction", violationType: "Obstruction", amount: 500 },
  { id: "clamping-loading", violationType: "Loading & Unloading Area", amount: 1000 },
];

const FALLBACK_IMPOUNDING: FineRow[] = [
  { id: "impounding-expired-ovr-top", violationType: "Expired OVR/TOP", amount: 1000 },
  { id: "impounding-invalid-provincial", violationType: "Invalid Provincial Ticket", amount: 500 },
  { id: "impounding-suspicious-license", violationType: "Suspicious License/OVR", amount: 1000 },
  { id: "impounding-improper-license", violationType: "Improper Use of License (Restriction Code)", amount: 500 },
  { id: "impounding-failure-carry", violationType: "Failure to Carry/Show OR/CR", amount: 1000 },
  { id: "impounding-tampered-or-cr", violationType: "Tampered OR/CR (Pertaining to Date)", amount: 1000 },
  { id: "impounding-expired-or-cr", violationType: "Expired OR/CR / Unregistered", amount: 500 },
  { id: "impounding-out-of-route", violationType: "Out of Route / Cutting Trip", amount: 1000 },
  { id: "impounding-driving-without-license", violationType: "Driving w/o License", amount: 500 },
  { id: "impounding-failure-show-carry", violationType: "Failure to Show/Carry", amount: 1000 },
];

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function Settings() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "it-admin",
  });

  /* Clamping */
  const [clamping, setClamping] = useState<FineRow[]>([]);
  const [clampingLoading, setClampingLoading] = useState(true);
  const [clampingDraft, setClampingDraft] = useState<Record<string, string>>({});
  const [clampingSaving, setClampingSaving] = useState(false);
  const [clampingSaved, setClampingSaved] = useState(false);

  /* Impounding */
  const [impounding, setImpounding] = useState<FineRow[]>([]);
  const [impoundingLoading, setImpoundingLoading] = useState(true);
  const [impoundingDraft, setImpoundingDraft] = useState<Record<string, string>>({});
  const [impoundingSaving, setImpoundingSaving] = useState(false);
  const [impoundingSaved, setImpoundingSaved] = useState(false);

  /* Thresholds */
  const [redemptionWindow, setRedemptionWindow] = useState("24");
  const [overdueAlert, setOverdueAlert] = useState("72");
  const [thresholdsSaving, setThresholdsSaving] = useState(false);
  const [thresholdsSaved, setThresholdsSaved] = useState(false);

  /* Fetch current user */
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

  /* Real-time: clampingFines */
  useEffect(() => {
    const finesRef = collection(db, "clampingFines");
    const finesQuery = query(finesRef, orderBy("order", "asc"));

    const unsubscribe = onSnapshot(
      finesQuery,
      (snapshot) => {
        if (snapshot.empty) {
          setClamping(FALLBACK_CLAMPING);
        } else {
          const fetched: FineRow[] = snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              violationType: data.violationType ?? "Unknown",
              amount: Number(data.amount ?? 0),
            };
          });
          setClamping(fetched);
        }
        setClampingLoading(false);
      },
      (error) => {
        console.error("Error fetching clamping fines:", error);
        setClamping(FALLBACK_CLAMPING);
        setClampingLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  /* Real-time: impoundingFines */
  useEffect(() => {
    const finesRef = collection(db, "impoundingFines");
    const finesQuery = query(finesRef, orderBy("order", "asc"));

    const unsubscribe = onSnapshot(
      finesQuery,
      (snapshot) => {
        if (snapshot.empty) {
          setImpounding(FALLBACK_IMPOUNDING);
        } else {
          const fetched: FineRow[] = snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              violationType: data.violationType ?? "Unknown",
              amount: Number(data.amount ?? 0),
            };
          });
          setImpounding(fetched);
        }
        setImpoundingLoading(false);
      },
      (error) => {
        console.error("Error fetching impounding fines:", error);
        setImpounding(FALLBACK_IMPOUNDING);
        setImpoundingLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  /* Real-time: impoundingThresholds */
  useEffect(() => {
    const thresholdRef = doc(db, "settings", "impoundingThresholds");
    const unsubscribe = onSnapshot(
      thresholdRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setRedemptionWindow(String(data.redemptionWindowHours ?? 24));
          setOverdueAlert(String(data.overdueAlertHours ?? 72));
        }
      },
      (error) => {
        console.error("Error fetching thresholds:", error);
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
      if (event.key === "Escape") setMenuOpen(false);
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

  /* ================================================================
     SAVE: Clamping fines
  ================================================================ */
  const handleSaveClamping = async () => {
    setClampingSaving(true);
    setClampingSaved(false);

    try {
      const updates = clamping.map(async (row) => {
        const draft = clampingDraft[row.id];
        if (draft === undefined || draft === "") return;

        const newAmount = parseInt(draft, 10);
        if (isNaN(newAmount) || newAmount < 0) return;
        if (newAmount === row.amount) return;

        await setDoc(
          doc(db, "clampingFines", row.id),
          {
            violationType: row.violationType,
            amount: newAmount,
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.name,
          },
          { merge: true }
        );
      });

      await Promise.all(updates);

      setClampingDraft({});
      setClampingSaved(true);
      setTimeout(() => setClampingSaved(false), 3000);
    } catch (err: any) {
      console.error("Error saving clamping fines:", err);
      alert(err.message || "Failed to save clamping fines.");
    } finally {
      setClampingSaving(false);
    }
  };

  /* ================================================================
     SAVE: Impounding fines
  ================================================================ */
  const handleSaveImpounding = async () => {
    setImpoundingSaving(true);
    setImpoundingSaved(false);

    try {
      const updates = impounding.map(async (row) => {
        const draft = impoundingDraft[row.id];
        if (draft === undefined || draft === "") return;

        const newAmount = parseInt(draft, 10);
        if (isNaN(newAmount) || newAmount < 0) return;
        if (newAmount === row.amount) return;

        await setDoc(
          doc(db, "impoundingFines", row.id),
          {
            violationType: row.violationType,
            amount: newAmount,
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.name,
          },
          { merge: true }
        );
      });

      await Promise.all(updates);

      setImpoundingDraft({});
      setImpoundingSaved(true);
      setTimeout(() => setImpoundingSaved(false), 3000);
    } catch (err: any) {
      console.error("Error saving impounding fines:", err);
      alert(err.message || "Failed to save impounding fines.");
    } finally {
      setImpoundingSaving(false);
    }
  };

  /* ================================================================
     SAVE: Thresholds
  ================================================================ */
  const handleSaveThresholds = async () => {
    setThresholdsSaving(true);
    setThresholdsSaved(false);

    try {
      const redemption = parseInt(redemptionWindow, 10);
      const overdue = parseInt(overdueAlert, 10);

      if (isNaN(redemption) || redemption < 1) {
        throw new Error("Redemption window must be a positive number.");
      }
      if (isNaN(overdue) || overdue < 1) {
        throw new Error("Overdue alert must be a positive number.");
      }

      await setDoc(
        doc(db, "settings", "impoundingThresholds"),
        {
          redemptionWindowHours: redemption,
          overdueAlertHours: overdue,
          updatedAt: serverTimestamp(),
          updatedBy: currentUser.name,
        },
        { merge: true }
      );

      setThresholdsSaved(true);
      setTimeout(() => setThresholdsSaved(false), 3000);
    } catch (err: any) {
      console.error("Error saving thresholds:", err);
      alert(err.message || "Failed to save thresholds.");
    } finally {
      setThresholdsSaving(false);
    }
  };

  const getClampingValue = (row: FineRow): string => {
    return clampingDraft[row.id] !== undefined
      ? clampingDraft[row.id]
      : String(row.amount);
  };

  const getImpoundingValue = (row: FineRow): string => {
    return impoundingDraft[row.id] !== undefined
      ? impoundingDraft[row.id]
      : String(row.amount);
  };

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
              <h1>System Settings</h1>
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

          <div className="settings-content">
            {/* TWO-COLUMN: Clamping + Impounding */}
            <div className="settings-grid">
              {/* Clamping fines */}
              <article className="card settings-card">
                <div className="card-header-static">
                  <h2 className="card-title-static">
                    Fine Amount – Clamping Violations
                  </h2>
                </div>

                {clampingLoading ? (
                  <div className="table-loading">
                    <RefreshCw size={20} className="spin" />
                    <p>Loading...</p>
                  </div>
                ) : (
                  <>
                    <div className="fine-table-wrapper">
                      <table className="fine-table">
                        <thead>
                          <tr>
                            <th>Violation type</th>
                            <th className="col-amount">Fine amount (₱)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clamping.map((row) => (
                            <tr key={row.id}>
                              <td className="cell-violation">{row.violationType}</td>
                              <td className="cell-amount">
                                <input
                                  type="number"
                                  min={0}
                                  value={getClampingValue(row)}
                                  onChange={(e) =>
                                    setClampingDraft((prev) => ({
                                      ...prev,
                                      [row.id]: e.target.value,
                                    }))
                                  }
                                  disabled={clampingSaving}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="fine-table-footer">
                      <button
                        type="button"
                        className="btn-save"
                        onClick={handleSaveClamping}
                        disabled={clampingSaving}
                      >
                        {clampingSaving ? (
                          <>
                            <Loader2 size={14} className="spin" /> Saving...
                          </>
                        ) : clampingSaved ? (
                          "Saved!"
                        ) : (
                          "Save Changes"
                        )}
                      </button>
                    </div>
                  </>
                )}
              </article>

              {/* Impounding fines */}
              <article className="card settings-card">
                <div className="card-header-static">
                  <h2 className="card-title-static">
                    Fine Amount – Impounding Violations
                  </h2>
                </div>

                {impoundingLoading ? (
                  <div className="table-loading">
                    <RefreshCw size={20} className="spin" />
                    <p>Loading...</p>
                  </div>
                ) : (
                  <>
                    <div className="fine-table-wrapper">
                      <table className="fine-table">
                        <thead>
                          <tr>
                            <th>Violation type</th>
                            <th className="col-amount">Fine amount (₱)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {impounding.map((row) => (
                            <tr key={row.id}>
                              <td className="cell-violation">{row.violationType}</td>
                              <td className="cell-amount">
                                <input
                                  type="number"
                                  min={0}
                                  value={getImpoundingValue(row)}
                                  onChange={(e) =>
                                    setImpoundingDraft((prev) => ({
                                      ...prev,
                                      [row.id]: e.target.value,
                                    }))
                                  }
                                  disabled={impoundingSaving}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="fine-table-footer">
                      <button
                        type="button"
                        className="btn-save"
                        onClick={handleSaveImpounding}
                        disabled={impoundingSaving}
                      >
                        {impoundingSaving ? (
                          <>
                            <Loader2 size={14} className="spin" /> Saving...
                          </>
                        ) : impoundingSaved ? (
                          "Saved!"
                        ) : (
                          "Save Changes"
                        )}
                      </button>
                    </div>
                  </>
                )}
              </article>
            </div>

            {/* IMPOUNDING THRESHOLDS */}
            <article className="card">
              <div className="card-header-static">
                <h2 className="card-title-static">Impounding Thresholds</h2>
              </div>

              <div className="thresholds-list">
                <div className="threshold-row">
                  <label htmlFor="redemption-window">
                    Redemption window before impound (hrs)
                  </label>
                  <input
                    id="redemption-window"
                    type="number"
                    min={1}
                    value={redemptionWindow}
                    onChange={(e) => setRedemptionWindow(e.target.value)}
                    disabled={thresholdsSaving}
                  />
                </div>

                <div className="threshold-row">
                  <label htmlFor="overdue-alert">
                    Overdue payment alert (hrs)
                  </label>
                  <input
                    id="overdue-alert"
                    type="number"
                    min={1}
                    value={overdueAlert}
                    onChange={(e) => setOverdueAlert(e.target.value)}
                    disabled={thresholdsSaving}
                  />
                </div>
              </div>

              <div className="fine-table-footer">
                <button
                  type="button"
                  className="btn-save"
                  onClick={handleSaveThresholds}
                  disabled={thresholdsSaving}
                >
                  {thresholdsSaving ? (
                    <>
                      <Loader2 size={14} className="spin" /> Saving...
                    </>
                  ) : thresholdsSaved ? (
                    "Saved!"
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </article>

            <div style={{ height: 24 }} />
          </div>
        </main>
      </div>
    </div>
  );
}