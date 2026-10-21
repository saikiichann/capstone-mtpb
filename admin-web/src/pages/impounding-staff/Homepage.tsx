import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./Homepage.css";
import ImpoundRecordsPanel from "../../components/impound/ImpoundRecordsPanel";
import ChangePasswordModal from "../../components/ChangePasswordModal";
import { daysInLot, pesoText, useImpoundRecords } from "../../lib/impoundRecords";

// ---------------------------------------------------------------------------
// ASSET IMPORTS
// ---------------------------------------------------------------------------
import mtpbLogo from "../../assets/mtpb-logo.png";
import officerAvatar from "../../assets/user.png";
import overviewIcon from "../../assets/overview.png";
import impoundingLogIcon from "../../assets/impounding.png";
import activeImpoundingIcon from "../../assets/tow-truck.png";
import fieldUpdatesIcon from "../../assets/fieldupdate.png";
import logoutIcon from "../../assets/logout.png";

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------
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

type NavItem = {
  label: string;
  icon: string;
  path: string;
  active?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<RoleSlug, string> = {
  oic: "Officer in Charge",
  "it-admin": "IT Admin",
  supervisor: "Supervisor",
  "record-officer": "Record Officer",
  "release-officer": "Release Officer",
  finance: "Finance",
  "clamping-staff": "Clamping Staff",
  "impounding-staff": "Impounding Staff",
};

const navGroups: NavGroup[] = [
  {
    label: "Dashboard",
    items: [
      {
        label: "Overview",
        icon: overviewIcon,
        path: "/impounding-staff",
        active: true,
      },
    ],
  },
  {
    label: "Enforcement",
    items: [
      {
        label: "Impounding Log",
        icon: impoundingLogIcon,
        path: "/impounding-staff/log",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Active Impounding",
        icon: activeImpoundingIcon,
        path: "/impounding-staff/active",
      },
      {
        label: "Field Updates",
        icon: fieldUpdatesIcon,
        path: "/impounding-staff/field-updates",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// HELPER FUNCTIONS
// ---------------------------------------------------------------------------
export default function ImpoundingStaffHomepage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "impounding-staff",
  });

  const [showChangePassword, setShowChangePassword] = useState(false);
  const { records } = useImpoundRecords();

  // ---------------------------------------------------------------------
  // EFFECT: Fetch current authenticated user profile
  // ---------------------------------------------------------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) {
        setCurrentUser({ name: "Guest", role: "impounding-staff" });
        return;
      }

      try {
        const userDocRef = doc(db, "users", loggedUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          setCurrentUser({
            name: data.name ?? "Unknown",
            role: (data.role ?? "impounding-staff") as RoleSlug,
          });
        } else {
          setCurrentUser({
            name: loggedUser.email?.split("@")[0] ?? "Unknown",
            role: "impounding-staff",
          });
        }
      } catch (err) {
        console.error("Error fetching current user:", err);
      }
    });

    return () => unsubscribe();
  }, []);

  // ---------------------------------------------------------------------
  // EFFECT: Close dropdown when clicking outside
  // ---------------------------------------------------------------------
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

  // ---------------------------------------------------------------------
  // METRICS — from the UOVR records (lib/impoundRecords.ts)
  // ---------------------------------------------------------------------
  const metrics = useMemo(() => {
    const today = new Date().toDateString();
    const isToday = (t: { toDate: () => Date } | null) => {
      try {
        return !!t && t.toDate().toDateString() === today;
      } catch {
        return false;
      }
    };
    const inLot = records.filter((r) => r.status === "For Payment");
    return {
      inLot: inLot.length,
      encodedToday: records.filter((r) => isToday(r.encodedAt)).length,
      releasedToday: records.filter((r) => r.status === "Released" && isToday(r.releasedAt)).length,
      feesDue: inLot.reduce((sum, r) => sum + r.impoundFee, 0),
      longest: inLot.reduce((max, r) => Math.max(max, daysInLot(r)), 0),
    };
  }, [records]);

  // ---------------------------------------------------------------------
  // HANDLERS
  // ---------------------------------------------------------------------
  const handleLogout = async () => {
    try {
      await firebaseSignOut(auth);
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      sessionStorage.clear();
      setIsMenuOpen(false);
      navigate("/");
    } catch (err) {
      console.error("Logout error:", err);
      setIsMenuOpen(false);
      navigate("/");
    }
  };

  const handleChangePassword = () => {
    setIsMenuOpen(false);
    setShowChangePassword(true);
  };

  const metricCards = [
    {
      title: "In the impound lot",
      value: String(metrics.inLot),
      subtitle: metrics.inLot ? `Longest stay: ${metrics.longest} day${metrics.longest === 1 ? "" : "s"}` : "No vehicles waiting",
    },
    {
      title: "Encoded today",
      value: String(metrics.encodedToday),
      subtitle: "UOVR tickets",
    },
    {
      title: "Released today",
      value: String(metrics.releasedToday),
      subtitle: "Impounding fee paid",
    },
    {
      title: "Fees to collect",
      value: pesoText(metrics.feesDue),
      subtitle: "Paid to the OIC",
    },
  ];

  return (
    <div className="impounding-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <img src={mtpbLogo} alt="MTPB Logo" className="sidebar-logo-img" />
            <div>
              <p className="sidebar-brand-name">MTPB</p>
              <p className="sidebar-brand-role">Impounding Staff</p>
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
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* MAIN CONTENT */}
        <div className="main">
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

            <div className="avatar-container" ref={dropdownRef}>
              <img
                src={officerAvatar}
                alt="Staff Profile"
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
                  <button
                    className="dropdown-item"
                    onClick={handleChangePassword}
                  >
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
            {/* METRIC CARDS */}
            <div className="metric-grid-four">
              {metricCards.map((card) => (
                <div key={card.title} className="card metric-card">
                  <p className="metric-title">{card.title}</p>
                  <p className="metric-value">{card.value}</p>
                  {card.subtitle && (
                    <p className="metric-subtitle">{card.subtitle}</p>
                  )}
                </div>
              ))}
            </div>

            {/* LATEST UOVR TICKETS */}
            <ImpoundRecordsPanel
              mode="staff"
              title="Latest UOVR Tickets"
              currentUserName={currentUser.name}
              limit={5}
              onViewAll={() => navigate("/impounding-staff/log")}
            />
          </main>
        </div>
      </div>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </div>
  );
}