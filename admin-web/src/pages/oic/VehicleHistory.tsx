import { useState, useEffect, useRef, useMemo, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Search } from "lucide-react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./VehicleHistory.css";

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

type TimelineEvent = { title: string; detail: string };

type ViolationGroup = {
  cin: string;
  recordedAt: Timestamp | null;
  location: string | null;
  barangay: string | null;
  events: TimelineEvent[];
};

type SearchState = "idle" | "loading" | "empty" | "results";

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
  finance: "Finance",
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
        active: true,
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
      },
    ],
  },
];

/** Plain-language label for each releaseStatus value used elsewhere in the
 *  system (see lib/release.ts). Falls back to the raw value for anything
 *  unrecognized, so a future status never renders as blank. */
const RELEASE_STATUS_LABELS: Record<string, string> = {
  Pending: "Awaiting payment",
  "Awaiting OIC Approval": "Awaiting OIC approval",
  "Approved by OIC": "Approved — awaiting release",
  "Rejected by OIC": "Rejected by OIC",
  Released: "Released",
};

/* ------------------------------------------------------------------
   HELPERS
------------------------------------------------------------------ */
const formatDateTime = (ts: Timestamp | null): string => {
  if (!ts) return "—";
  try {
    return ts.toDate().toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

const millis = (ts: Timestamp | null): number => {
  try {
    return ts ? ts.toMillis() : 0;
  } catch {
    return 0;
  }
};

/** "₱1,000" — whole pesos, no decimals. This is a narrative timeline
 *  sentence, not a receipt, so it stays simpler than the 2-decimal
 *  currency formatting used on the payment/finance pages. */
const formatPeso = (amount: number): string =>
  `₱${Math.round(amount).toLocaleString("en-US")}`;

/**
 * "abg 1234" / " ABG   1234 " → "ABG 1234". Matches the same trim+uppercase
 * that issueViolationForClamp already applies when a violation is first
 * written, so a search only succeeds if it matches that exact spacing —
 * Firestore has no partial/fuzzy match, so this is an exact-plate lookup,
 * not a live filter.
 */
const normalizePlate = (value: string): string =>
  value.trim().toUpperCase().replace(/\s+/g, " ");

/**
 * Builds this violation's narrative timeline from its real fields, in the
 * same four-stage shape the design uses — but reflecting actual payment
 * and release state instead of frozen sample text.
 */
const buildEvents = (cin: string, data: Record<string, any>): TimelineEvent[] => {
  const events: TimelineEvent[] = [];
  const fineAmount = Number(data.fineAmount ?? 0);

  events.push({
    title: `Violation recorded — ${data.violationType ?? "Violation"}`,
    detail: `${formatDateTime(data.recordedAt ?? null)} · ${cin}`,
  });

  events.push({
    title: `Fine computed — ${formatPeso(fineAmount)}`,
    detail: "Automated, based on vehicle classification",
  });

  const paymentStatus = data.paymentStatus ?? "Unpaid";
  const paidAmount = Number(data.totalPaid ?? fineAmount);
  const viaMethod = data.paymentMethod ? ` · Paid via ${data.paymentMethod}` : "";

  if (paymentStatus === "Verified") {
    events.push({
      title: "Payment verified",
      detail: `${formatPeso(paidAmount)}${viaMethod}`,
    });
  } else if (paymentStatus === "Pending Verification") {
    events.push({
      title: "Payment pending verification",
      detail: `${formatPeso(paidAmount)}${viaMethod}`,
    });
  } else if (paymentStatus === "Rejected") {
    events.push({
      title: "Payment rejected",
      detail: data.rejectionReason
        ? String(data.rejectionReason)
        : "Verification failed",
    });
  } else {
    events.push({
      title: "Payment not yet made",
      detail: `${formatPeso(fineAmount)} due`,
    });
  }

  const releaseStatus = String(data.releaseStatus ?? "Pending");
  events.push({
    title: "Status",
    detail: RELEASE_STATUS_LABELS[releaseStatus] ?? releaseStatus,
  });

  return events;
};

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function VehicleHistory() {
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "oic",
  });
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [queriedPlate, setQueriedPlate] = useState<string | null>(null);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [groups, setGroups] = useState<ViolationGroup[]>([]);

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

  /**
   * One-off lookup, not a live listener — a plate search is an on-demand
   * query the OIC triggers, not something that needs to auto-update while
   * the page sits open.
   */
  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    const plate = normalizePlate(searchInput);
    if (!plate) return;

    setQueriedPlate(plate);
    setSearchState("loading");

    try {
      const snap = await getDocs(
        query(collection(db, "violations"), where("plateNo", "==", plate))
      );

      const built: ViolationGroup[] = snap.docs
        .map((d) => {
          const data = d.data();
          const cin = data.cin ?? d.id;
          return {
            cin,
            recordedAt: (data.recordedAt as Timestamp) ?? null,
            location: data.location ?? null,
            barangay: data.barangay ?? null,
            events: buildEvents(cin, data),
          };
        })
        .sort((a, b) => millis(b.recordedAt) - millis(a.recordedAt));

      setGroups(built);
      setSearchState(built.length === 0 ? "empty" : "results");
    } catch (err) {
      console.error("Vehicle history search failed:", err);
      setGroups([]);
      setSearchState("empty");
    }
  };

  const latestLocationLabel = useMemo(() => {
    const newest = groups[0];
    if (!newest) return null;
    if (newest.barangay) return `${newest.barangay}, Sector 3`;
    return newest.location;
  }, [groups]);

  return (
    <div className="oic-page vehicle-history-page">
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
              <h1>Vehicle History</h1>
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
            {/* LOOKUP CARD */}
            <div className="card">
              <div className="vehicle-lookup">
                <div>
                  <p className="card-eyebrow">Lookup</p>
                  <h2 className="card-title">Vehicle History</h2>
                  <p className="vehicle-lookup-hint">
                    {queriedPlate ? (
                      <>
                        Showing history for {queriedPlate}
                        {latestLocationLabel && (
                          <>
                            <br />
                            {latestLocationLabel}
                          </>
                        )}
                      </>
                    ) : (
                      "Enter a plate number to view enforcement history"
                    )}
                  </p>
                </div>

                <form onSubmit={handleSearch} className="vehicle-search">
                  <Search size={16} className="vehicle-search-icon" />
                  <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search Plate Number"
                    className="vehicle-search-input"
                  />
                </form>
              </div>
            </div>

            {/* RESULTS / EMPTY STATE */}
            {searchState === "results" ? (
              <div className="card">
                <p className="card-eyebrow">Timeline</p>
                <h2 className="card-title" style={{ marginBottom: 16 }}>
                  Enforcement history — {queriedPlate}
                </h2>

                <div className="vehicle-timeline-groups">
                  {groups.map((group) => (
                    <div key={group.cin} className="vehicle-timeline-group">
                      {groups.length > 1 && (
                        <p className="vehicle-timeline-group-label">
                          <span className="cin-pill">{group.cin}</span>
                        </p>
                      )}
                      <div className="vehicle-timeline">
                        {group.events.map((ev, i) => (
                          <div key={i} className="vehicle-timeline-item">
                            <span className="vehicle-timeline-dot" />
                            <div>
                              <div className="vehicle-timeline-title">
                                {ev.title}
                              </div>
                              <div className="vehicle-timeline-detail">
                                {ev.detail}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="card">
                <div className="vehicle-empty">
                  <p className="vehicle-empty-text">
                    {searchState === "loading"
                      ? "Searching..."
                      : searchState === "empty"
                      ? `No violations found for ${queriedPlate}.`
                      : "No vehicle selected. Search a plate number to view its history."}
                  </p>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}