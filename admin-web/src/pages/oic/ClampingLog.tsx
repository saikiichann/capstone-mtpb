import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  KeyRound,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./ClampingLog.css";

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

type LogStatus = "Clamped" | "Removed";

type ClampLogRow = {
  id: string;
  reference: string | null;
  cin: string;
  plateNo: string;
  violation: string;
  location: string;
  officer: string;
  recordedAt: Timestamp | null;
  status: LogStatus;
  /** True once "Subject to Impound" has been set (auto or manual). */
  alreadyFlagged: boolean;
  /** True kapag auto-flagged ng system (24hr expired). */
  autoFlagged: boolean;
  /** The impound status field from Firestore. */
  impoundStatus: string | null;
  /** Hours since clamping. */
  hoursSinceClamp: number;
};

type NavItem = { label: string; icon: string; path: string; active?: boolean };
type NavGroup = { label: string; items: NavItem[] };

/* ------------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------------ */
const ITEMS_PER_PAGE = 10;
const ALL_VIOLATIONS = "All Violations";
const GRACE_PERIOD_HOURS = 24;
const IMPOUND_FEE = 2000;

const MASTER_VIOLATIONS = [
  "Illegal Parking",
  "No Parking Zone",
  "Obstruction",
  "Sidewalk Parking",
  "Street Corner Parking",
  "Left Side Parking",
  "Right Side Parking",
  "Top of the Bridge Parking",
  "Loading & Unloading Area",
  "Blocking Driveway",
  "Blocking PWD Lane",
  "Blocking Fire Hydrant",
  "Complaint Area",
  "Blocking Pedestrian Lane",
  "Blocking Fire Truck Lane",
  "Double Parking",
];

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
      { label: "Sector Analytics", icon: sectorAnalyticsIcon, path: "/dashboard/sector-analytics" },
      { label: "Geospatial Heatmap", icon: mapIcon, path: "/dashboard/heatmap" },
    ],
  },
  {
    label: "Enforcement",
    items: [
      { label: "Clamping Log", icon: clampingIcon, path: "/dashboard/clamping", active: true },
      { label: "Impounding Log", icon: impoundingIcon, path: "/dashboard/impounding" },
      { label: "Vehicle History", icon: historyIcon, path: "/dashboard/vehicle-history" },
    ],
  },
  {
    label: "Payment/Finance",
    items: [
      { label: "Pending Payments", icon: pendingPaymentsIcon, path: "/dashboard/pending-payments" },
      { label: "Payment Verification", icon: paymentVerificationIcon, path: "/dashboard/verification" },
      { label: "Transaction History", icon: transactionIcon, path: "/dashboard/transactions" },
      { label: "Revenue Reports", icon: revenueIcon, path: "/dashboard/revenue" },
    ],
  },
  {
    label: "Vehicle Release",
    items: [
      { label: "Release Requests", icon: releaseRequestIcon, path: "/dashboard/release-requests" },
      { label: "Release Queue", icon: queueIcon, path: "/dashboard/release-queue" },
      { label: "Release Log", icon: releaseLogIcon, path: "/dashboard/release-log" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Active Clamping Teams", icon: clampingTeamsIcon, path: "/dashboard/clamping-teams" },
      { label: "Active Impounding", icon: towTruckIcon, path: "/dashboard/active-impounding" },
      { label: "Field Updates", icon: fieldUpdateIcon, path: "/dashboard/field-updates" },
      { label: "Operation Scheduler", icon: operationSchedulerIcon, path: "/dashboard/operation-scheduler" },
    ],
  },
];

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

/**
 * Computes hours elapsed since the vehicle was clamped.
 * Returns 0 if no recordedAt.
 */
const computeHoursSinceClamp = (ts: Timestamp | null): number => {
  if (!ts) return 0;
  try {
    return (Date.now() - ts.toDate().getTime()) / (1000 * 60 * 60);
  } catch {
    return 0;
  }
};

const normalizeViolationType = (raw: unknown): string => {
  if (typeof raw !== "string") return "—";
  const trimmed = raw.trim();
  if (!trimmed) return "—";

  const knownMap: Record<string, string> = {
    "illegal parking": "Illegal Parking",
    "no parking zone": "No Parking Zone",
    obstruction: "Obstruction",
    "sidewalk parking": "Sidewalk Parking",
    "street corner parking": "Street Corner Parking",
    "left side parking": "Left Side Parking",
    "right side parking": "Right Side Parking",
    "top of the bridge parking": "Top of the Bridge Parking",
    "loading & unloading area": "Loading & Unloading Area",
    "blocking driveway": "Blocking Driveway",
    "blocking pwd lane": "Blocking PWD Lane",
    "blocking fire hydrant": "Blocking Fire Hydrant",
    "complaint area": "Complaint Area",
    "blocking pedestrian lane": "Blocking Pedestrian Lane",
    "blocking fire truck lane": "Blocking Fire Truck Lane",
    "double parking": "Double Parking",
  };

  const key = trimmed.toLowerCase();
  if (key in knownMap) return knownMap[key];

  return trimmed
    .split(" ")
    .map((word) => {
      if (!word) return word;
      if (word === word.toUpperCase() && word.length <= 4) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
};

const deriveLogStatus = (releaseStatus: unknown): LogStatus =>
  releaseStatus === "Released" ? "Removed" : "Clamped";

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function ClampingLog() {
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "oic",
  });
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [rows, setRows] = useState<ClampLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  /** True kapag na-load na ang role — hindi tatakbo ang auto-flag bago nito. */
  const [userLoaded, setUserLoaded] = useState(false);
  /** IDs ng violations na may impoundRecords na; null habang naglo-load. */
  const [impoundRecordIds, setImpoundRecordIds] = useState<Set<string> | null>(null);
  const autoFlagRunning = useRef(false);
  /** Mga violation na naproseso na sa session na ito — iwas doble. */
  const autoFlagHandled = useRef<Set<string>>(new Set());

  const [searchQuery, setSearchQuery] = useState("");
  const [violationFilter, setViolationFilter] = useState(ALL_VIOLATIONS);
  const [currentPage, setCurrentPage] = useState(1);

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
          setUserLoaded(true);
        }
      } catch (err) {
        console.error("Failed to load current user:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  /* Fetch clamping records */
  useEffect(() => {
    const q = query(
      collection(db, "violations"),
      where("enforcementType", "==", "clamped")
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const fetched: ClampLogRow[] = snap.docs
          .map((d) => {
            const data = d.data();
            const recordedAt = (data.recordedAt as Timestamp) ?? null;
            const hoursSinceClamp = computeHoursSinceClamp(recordedAt);
            const releaseStatus = data.releaseStatus;

            return {
              id: d.id,
              reference:
                (data.referenceNumber as string) ??
                (data.paymentReference as string) ??
                null,
              cin: data.cin ?? "—",
              plateNo: data.plateNo ?? "—",
              violation: normalizeViolationType(data.violationType),
              location: data.location ?? "—",
              officer: data.officer ?? "—",
              recordedAt,
              status: deriveLogStatus(releaseStatus),
              alreadyFlagged: data.impoundStatus === "Subject to Impound",
              autoFlagged: data.impoundAutoFlagged ?? false,
              impoundStatus: data.impoundStatus ?? null,
              hoursSinceClamp,
            };
          })
          .sort((a, b) => millis(b.recordedAt) - millis(a.recordedAt));

        setRows(fetched);
        setLoading(false);
      },
      (err) => {
        console.warn("Clamping log fetch failed:", err.code);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  /* Which violations already have an impoundRecords entry */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "impoundRecords"),
      (snap) => {
        const ids = new Set<string>();
        snap.docs.forEach((d) => {
          ids.add(d.id);
          const source = d.data().sourceViolationId;
          if (typeof source === "string" && source) ids.add(source);
        });
        setImpoundRecordIds(ids);
      },
      (err) => console.warn("impoundRecords fetch failed:", err.code)
    );
    return () => unsubscribe();
  }, []);

  /* ------------------------------------------------------------------
     AUTO-FLAG OVERDUE VIOLATIONS (Client-Side)

     Runs whenever the OIC opens this page. Two jobs:

     1. Clamped violations past the 24-hour grace period are flagged
        "Subject to Impound" with a fixed impound fee of ₱2,000.
     2. Every flagged violation gets an impoundRecords entry (doc id =
        violation id). That collection is what Active Impounding, the
        Impounding Staff pages and the Impounding Log read, so without it
        a flagged vehicle never reaches the impounding side. This also
        backfills violations that were auto-flagged before this fix.

     OIC only: Firestore rules allow only the OIC to set impoundStatus and
     to create impoundRecords, so for a Supervisor the batch would fail.

     This is a client-side alternative to a scheduled Cloud Function,
     used because the thesis project does not have access to a Blaze
     billing plan.
  ------------------------------------------------------------------ */
  useEffect(() => {
    if (loading || rows.length === 0) return;
    if (!userLoaded || currentUser.role !== "oic") return;
    if (impoundRecordIds === null) return;
    if (autoFlagRunning.current) return;

    const handled = autoFlagHandled.current;
    const isActiveClamp = (row: ClampLogRow) =>
      row.status === "Clamped" &&
      row.impoundStatus !== "Impounded" &&
      !handled.has(row.id);

    // 1. Past the grace period and not yet flagged
    const overdueRows = rows.filter(
      (row) =>
        isActiveClamp(row) &&
        row.hoursSinceClamp >= GRACE_PERIOD_HOURS &&
        row.impoundStatus !== "Subject to Impound"
    );

    // 2. Already flagged but missing its impoundRecords entry
    const missingRecordRows = rows.filter(
      (row) =>
        isActiveClamp(row) &&
        row.impoundStatus === "Subject to Impound" &&
        !impoundRecordIds.has(row.id)
    );

    if (overdueRows.length === 0 && missingRecordRows.length === 0) return;

    const work = [
      ...overdueRows.map((row) => ({ row, flag: true })),
      ...missingRecordRows.map((row) => ({ row, flag: false })),
    ];

    const autoFlagOverdue = async () => {
      autoFlagRunning.current = true;
      console.log(
        `[auto-flag] Flagging ${overdueRows.length}, adding impound records for ${missingRecordRows.length}`
      );

      // A batch holds up to 500 writes; each row uses at most 3.
      const CHUNK = 150;
      try {
        for (let i = 0; i < work.length; i += CHUNK) {
          const chunk = work.slice(i, i + CHUNK);
          const batch = writeBatch(db);

          chunk.forEach(({ row, flag }) => {
            if (flag) {
              batch.update(doc(db, "violations", row.id), {
                impoundStatus: "Subject to Impound",
                impoundFlaggedAt: serverTimestamp(),
                impoundFlaggedBy: "system",
                impoundFlaggedByRole: "system",
                impoundAutoFlagged: true,
                impoundFee: IMPOUND_FEE,
                updatedAt: serverTimestamp(),
                updatedBy: "system",
              });

              batch.set(doc(collection(db, "auditLogs")), {
                userName: "System",
                userRole: "system",
                action: `auto-flagged violation ${row.cin} as Subject to Impound (24hr grace period expired)`,
                record: row.cin,
                type: "impound-flag-auto",
                metadata: {
                  cin: row.cin,
                  plateNo: row.plateNo,
                  hoursSinceClamp: Math.round(row.hoursSinceClamp),
                  impoundFee: IMPOUND_FEE,
                  method: "client-side",
                },
                timestamp: serverTimestamp(),
              });
            }

            if (!impoundRecordIds.has(row.id)) {
              batch.set(doc(db, "impoundRecords", row.id), {
                sourceViolationId: row.id,
                referenceNumber: row.reference,
                cin: row.cin,
                plateNo: row.plateNo,
                location: row.location,
                initialViolation: row.violation,
                clampedBy: row.officer,
                clampedAt: row.recordedAt,
                status: "Subject to Impound",
                impoundFee: IMPOUND_FEE,
                autoFlagged: flag || row.autoFlagged,
                createdBy: "system",
                createdAt: serverTimestamp(),
              });
            }
          });

          await batch.commit();
          chunk.forEach(({ row }) => handled.add(row.id));
        }
        console.log("[auto-flag] Done");
      } catch (err) {
        console.error("[auto-flag] Failed to flag overdue violations:", err);
      } finally {
        autoFlagRunning.current = false;
      }
    };

    autoFlagOverdue();
  }, [loading, rows, userLoaded, currentUser.role, impoundRecordIds]);

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

  /** Dropdown options: master list + actual data. */
  const violationOptions = useMemo(() => {
    const unique = new Set<string>(MASTER_VIOLATIONS);
    rows.forEach((row) => {
      if (row.violation && row.violation !== "—") unique.add(row.violation);
    });
    return [ALL_VIOLATIONS, ...Array.from(unique).sort()];
  }, [rows]);

  /* Search + filter */
  const filteredRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return rows.filter((row) => {
      const matchesSearch =
        !q ||
        row.cin.toLowerCase().includes(q) ||
        row.plateNo.toLowerCase().includes(q) ||
        row.location.toLowerCase().includes(q) ||
        row.violation.toLowerCase().includes(q);
      const matchesViolation =
        violationFilter === ALL_VIOLATIONS || row.violation === violationFilter;
      return matchesSearch && matchesViolation;
    });
  }, [rows, searchQuery, violationFilter]);

  const activeClamps = useMemo(
    () => rows.filter((r) => r.status === "Clamped").length,
    [rows]
  );

  /* Pagination */
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = filteredRows.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, violationFilter]);

  return (
    <div className="oic-page clamping-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <img src={logo} alt="MTPB logo" className="sidebar-logo-img" />
            <div>
              <p className="sidebar-brand-name">MTPB</p>
              <p className="sidebar-brand-role">{ROLE_LABELS[currentUser.role]}</p>
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
                        className={`nav-item ${item.active ? "nav-item-active" : ""}`}
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
              <h1>Clamping Log</h1>
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
                    <p className="dropdown-role">{ROLE_LABELS[currentUser.role]}</p>
                  </div>
                  <button className="dropdown-item">
                    <KeyRound size={18} />
                    <span>Change Password</span>
                  </button>
                  <button className="dropdown-item logout" onClick={handleLogout}>
                    <img src={logoutIcon} alt="" className="dropdown-icon" />
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </div>
          </header>

          <main className="main-content clamping-body">
            {/* SEARCH + FILTER */}
            <div className="clamping-toolbar">
              <div className="search-bar-container">
                <Search size={18} className="search-bar-icon" />
                <input
                  type="text"
                  className="search-bar-input"
                  placeholder="Search CIN, Plate No..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="filter-select-wrap">
                <select
                  className="filter-select"
                  value={violationFilter}
                  onChange={(e) => setViolationFilter(e.target.value)}
                  aria-label="Filter by violation"
                >
                  {violationOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <ChevronDown size={18} className="filter-select-icon" />
              </div>
            </div>

            {/* TABLE */}
            <div className="card clamping-card">
              <div className="log-header">
                <div>
                  <p className="card-eyebrow">Sector 3</p>
                  <h2 className="card-title">Clamping Log</h2>
                </div>
                <div className="log-header-meta">
                  Active clamps: <strong>{activeClamps}</strong> total
                </div>
              </div>

              {loading ? (
                <div className="table-loading">
                  <p>Loading clamping log...</p>
                </div>
              ) : paginatedRows.length === 0 ? (
                <div className="table-empty">
                  <p>
                    {rows.length === 0
                      ? "No clamping records found."
                      : "No records match your search or filter."}
                  </p>
                </div>
              ) : (
                <div className="clamping-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Reference</th>
                        <th>CIN</th>
                        <th>Plate No.</th>
                        <th>Violation</th>
                        <th>Location</th>
                        <th>Clamped by</th>
                        <th>Time</th>
                        <th>Status</th>
                        <th>Impound</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRows.map((row) => (
                        <tr key={row.id}>
                          <td className="cell-reference">{row.reference ?? "—"}</td>
                          <td>
                            <span className="cin-pill">{row.cin}</span>
                          </td>
                          <td className="cell-plate">{row.plateNo}</td>
                          <td className="cell-violation">{row.violation}</td>
                          <td className="cell-location">{row.location}</td>
                          <td className="cell-officer">{row.officer}</td>
                          <td className="cell-time">{formatDateTime(row.recordedAt)}</td>
                          <td>
                            <span
                              className={`status-pill ${
                                row.status === "Clamped"
                                  ? "status-clamped"
                                  : "status-removed"
                              }`}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td>
                            {/* AUTO-FLAG INDICATOR — walang manual button */}
                            {row.status === "Clamped" &&
                              row.hoursSinceClamp < GRACE_PERIOD_HOURS &&
                              row.impoundStatus !== "Subject to Impound" &&
                              row.impoundStatus !== "Impounded" && (
                                <span className="impound-pending">
                                  Within {GRACE_PERIOD_HOURS}hr grace
                                </span>
                              )}

                            {row.impoundStatus === "Subject to Impound" && (
                              <span
                                className={`badge-impound ${
                                  row.autoFlagged ? "badge-impound-auto" : ""
                                }`}
                                title={
                                  row.autoFlagged
                                    ? "Auto-flagged by system (24hr grace period expired)"
                                    : "Flagged as Subject to Impound"
                                }
                              >
                                {row.autoFlagged
                                  ? "🤖 Auto-flagged (₱2,000)"
                                  : "Subject to Impound (₱2,000)"}
                              </span>
                            )}

                            {row.impoundStatus === "Impounded" && (
                              <span className="badge-impounded">Impounded</span>
                            )}

                            {row.status === "Removed" && (
                              <span className="action-placeholder">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* PAGINATION */}
              {!loading && paginatedRows.length > 0 && (
                <div className="pagination">
                  <button
                    type="button"
                    className="pagination-btn"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                  >
                    <ChevronLeft size={16} />
                    Previous
                  </button>

                  <div className="pagination-info">
                    <span className="pagination-page">{safePage}</span>
                    <span className="pagination-sep">of {totalPages} pages</span>
                  </div>

                  <button
                    type="button"
                    className="pagination-btn"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                  >
                    Next
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}