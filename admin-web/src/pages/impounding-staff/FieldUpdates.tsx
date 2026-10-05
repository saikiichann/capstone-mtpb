import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  limit,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./FieldUpdates.css";

// Assets
import mtpbLogo from "../../assets/mtpb-logo.png";
import officerAvatar from "../../assets/user.png";
import overviewIcon from "../../assets/overview.png";
import impoundingLogIcon from "../../assets/impounding.png";
import activeImpoundingIcon from "../../assets/tow-truck.png";
import fieldUpdatesIcon from "../../assets/fieldupdate.png";
import logoutIcon from "../../assets/logout.png";

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

type CurrentUser = {
  name: string;
  role: RoleSlug;
};

type FieldSubmission = {
  id: string;
  officerName: string;
  sector: string;
  street: string;
  cin: string;
  violationType: string;
  notes: string;
  photoCount: number;
  timestamp: Timestamp | null;
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

/* ------------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------------ */
const FEED_LIMIT = 20;

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
      { label: "Overview", icon: overviewIcon, path: "/impounding-staff" },
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
        active: true,
      },
    ],
  },
];

/* ------------------------------------------------------------------
   HELPERS
------------------------------------------------------------------ */
const formatTime = (ts: Timestamp | null): string => {
  if (!ts) return "—";
  try {
    return ts.toDate().toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "—";
  }
};

/**
 * The pill only shows the time, so entries from earlier days would be
 * ambiguous. Returns a short date for those, and null for today's entries.
 */
const formatDateIfNotToday = (ts: Timestamp | null): string | null => {
  if (!ts) return null;
  try {
    const date = ts.toDate();
    if (date.toDateString() === new Date().toDateString()) return null;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return null;
  }
};

/** "Bautista" → "Ofc. Bautista". Leaves names that already have a title alone. */
const formatOfficer = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) return "Unknown officer";
  if (/^(ofc|officer)\b/i.test(trimmed)) return trimmed;
  return `Ofc. ${trimmed}`;
};

const buildTitle = (submission: FieldSubmission): string => {
  const officer = formatOfficer(submission.officerName);
  const place = [submission.sector, submission.street]
    .filter(Boolean)
    .join(" — ");
  return place ? `${officer} · ${place}` : officer;
};

const buildSubtitle = (submission: FieldSubmission): string => {
  const photos = `${submission.photoCount} ${
    submission.photoCount === 1 ? "photo" : "photos"
  }`;
  return [
    submission.cin ? `${submission.cin} encoded` : "",
    submission.violationType,
    submission.notes,
    photos,
  ]
    .filter(Boolean)
    .join(" · ");
};

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function FieldUpdates() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "impounding-staff",
  });

  const [submissions, setSubmissions] = useState<FieldSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  /* Fetch current user */
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

  /* Fetch recent field submissions (live feed) */
  useEffect(() => {
    const ref = collection(db, "fieldSubmissions");
    const q = query(ref, orderBy("timestamp", "desc"), limit(FEED_LIMIT));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const rows: FieldSubmission[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            officerName: data.officerName ?? "",
            sector: data.sector ?? "",
            street: data.street ?? "",
            cin: data.cin ?? "",
            violationType: data.violationType ?? "",
            notes: data.notes ?? "",
            photoCount: Number(data.photoCount ?? 0),
            timestamp: data.timestamp ?? null,
          };
        });
        setSubmissions(rows);
        setLoading(false);
      },
      (err) => {
        console.warn("Field submissions fetch failed:", err.code);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  /* Click outside dropdown */
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
      navigate("/");
    } catch (err) {
      console.error("Logout error:", err);
      setIsMenuOpen(false);
      navigate("/");
    }
  };

  const handleChangePassword = () => {
    console.log("Navigating to Change Password...");
    setIsMenuOpen(false);
  };

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
              <h1>Field Updates</h1>
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
            {/* LIVE FEED */}
            <div className="card feed-card">
              <div className="feed-header">
                <p className="card-eyebrow">Live Feed</p>
                <h2 className="card-title">Recent Field Submissions</h2>
              </div>

              {loading ? (
                <div className="table-loading">
                  <p>Loading field submissions...</p>
                </div>
              ) : submissions.length === 0 ? (
                <div className="table-empty">
                  <p>No field submissions yet.</p>
                </div>
              ) : (
                <ul className="feed-list">
                  {submissions.map((submission) => {
                    const otherDay = formatDateIfNotToday(submission.timestamp);
                    return (
                      <li key={submission.id} className="feed-item">
                        <div className="feed-time">
                          <span className="time-pill">
                            {formatTime(submission.timestamp)}
                          </span>
                          {otherDay && (
                            <span className="time-date">{otherDay}</span>
                          )}
                        </div>
                        <div className="feed-content">
                          <p className="feed-title">{buildTitle(submission)}</p>
                          <p className="feed-subtitle">
                            {buildSubtitle(submission)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}