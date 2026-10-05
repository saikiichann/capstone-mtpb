import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  KeyRound,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
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
  /** True once "Subject to Impound" has already been pressed for this row. */
  alreadyFlagged: boolean;
};

type NavItem = { label: string; icon: string; path: string; active?: boolean };
type NavGroup = { label: string; items: NavItem[] };

/* ------------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------------ */
const ITEMS_PER_PAGE = 10;
const ALL_VIOLATIONS = "All Violations";

/**
 * Master list ng lahat ng violation types na supported ng MTPB.
 *
 * Ito ang source of truth para sa dropdown options — hindi ito naka-derive
 * lang sa existing data, kasi kung 2 violations pa lang ang naka-record,
 * 2 options lang ang lalabas sa dropdown. Ang master list na ito ay
 * naka-merge sa actual data para kumpleto yung dropdown.
 *
 * Kung may bagong violation type sa future, i-add lang dito.
 */
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
      {
        label: "Clamping Log",
        icon: clampingIcon,
        path: "/dashboard/clamping",
        active: true,
      },
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
      },
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
 * Normalizes violation type strings for consistent display.
 *
 * Ang mga violation types ay naka-store sa Firestore nang iba-ibang casing
 * (e.g. "Illegal parking" vs "Illegal Parking") depende kung saan na-create.
 * Ito ay nagna-normalize para consistent ang display sa filter dropdown at
 * sa table cells — Title Case na may proper capitalization.
 */
const normalizeViolationType = (raw: unknown): string => {
  if (typeof raw !== "string") return "—";
  const trimmed = raw.trim();
  if (!trimmed) return "—";

  // Special case: known multi-word violations na dapat may specific casing
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

  // Fallback: title-case each word, pero panatilihin yung acronyms
  return trimmed
    .split(" ")
    .map((word) => {
      if (!word) return word;
      // All-caps acronym (PWD, LTO, MMDA, etc.) — keep as-is
      if (word === word.toUpperCase() && word.length <= 4) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
};

/**
 * A violation is "Removed" once the release flow has actually released it
 * (releaseStatus === "Released", written by markViolationAsReleased in
 * lib/release.ts). Anything else — unpaid, verified, awaiting OIC approval —
 * still has the clamp physically on the vehicle, so it reads as "Clamped".
 */
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

  const [searchQuery, setSearchQuery] = useState("");
  const [violationFilter, setViolationFilter] = useState(ALL_VIOLATIONS);
  const [currentPage, setCurrentPage] = useState(1);

  const [confirming, setConfirming] = useState<ClampLogRow | null>(null);
  const [isFlagging, setIsFlagging] = useState(false);

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
   * Clamping actions only (enforcementType == "clamped") — impounding has
   * its own log page. No orderBy() on purpose: Firestore silently drops
   * documents that lack the ordered field, so a record without recordedAt
   * would vanish instead of showing up out of order. Sorting happens
   * client-side.
   */
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
              recordedAt: (data.recordedAt as Timestamp) ?? null,
              status: deriveLogStatus(data.releaseStatus),
              alreadyFlagged: data.impoundStatus === "Subject to Impound",
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
   * Dropdown options: master list + actual data.
   *
   * Sinisiguro na lahat ng 16+ violation types ay lalabas sa dropdown kahit
   * konti pa lang ang naka-record na violations. Kung may bagong violation
   * type sa actual data (halimbawa, manual entry na wala sa master list),
   * automatic din itong lalabas.
   */
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
  // Clamped here, during render, instead of an effect that calls
  // setCurrentPage after the fact — React's guidance is to derive a value
  // like this rather than "correct" state in a useEffect, which causes an
  // extra render on top of the one that already updated totalPages.
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = filteredRows.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, violationFilter]);

  const handleMarkSubjectToImpound = async () => {
    if (!confirming) return;

    if (currentUser.role !== "oic") {
      alert("Only the OIC can flag a vehicle as Subject to Impound.");
      return;
    }

    setIsFlagging(true);

    try {
      const batch = writeBatch(db);

      batch.update(doc(db, "violations", confirming.id), {
        impoundStatus: "Subject to Impound",
        impoundFlaggedAt: serverTimestamp(),
        impoundFlaggedBy: currentUser.name,
      });

      batch.set(
        doc(db, "impoundRecords", confirming.id),
        {
          cin: confirming.cin,
          plateNo: confirming.plateNo,
          location: confirming.location,
          clampedBy: confirming.officer,
          clampedAt: confirming.recordedAt,
          status: "Subject to Impound",
        },
        { merge: true }
      );

      batch.set(doc(collection(db, "auditLogs")), {
        userName: currentUser.name,
        action: `flagged ${confirming.cin} as Subject to Impound`,
        record: confirming.cin,
        type: "clamping-log",
        metadata: { cin: confirming.cin, plateNo: confirming.plateNo },
        timestamp: serverTimestamp(),
      });

      await batch.commit();
      setConfirming(null);
      // Confirmed — take the OIC straight to the queue where the flagged
      // vehicle now shows up, instead of leaving them on the log.
      navigate("/dashboard/active-impounding");
    } catch (err: any) {
      console.error("Flagging for impound failed:", err);
      alert(err.message || "Failed to flag this vehicle for impound.");
    } finally {
      setIsFlagging(false);
    }
  };

  return (
    <div className="oic-page clamping-page">
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

          <main className="main-content clamping-body">
            {/* SEARCH + FILTER — side-by-side toolbar */}
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
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRows.map((row) => (
                        <tr key={row.id}>
                          <td className="cell-reference">
                            {row.reference ?? "—"}
                          </td>
                          <td>
                            <span className="cin-pill">{row.cin}</span>
                          </td>
                          <td className="cell-plate">{row.plateNo}</td>
                          <td className="cell-violation">{row.violation}</td>
                          <td className="cell-location">{row.location}</td>
                          <td className="cell-officer">{row.officer}</td>
                          <td className="cell-time">
                            {formatDateTime(row.recordedAt)}
                          </td>
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
                            {row.status === "Clamped" ? (
                              currentUser.role !== "oic" ? (
                                <span className="action-placeholder">
                                  OIC only
                                </span>
                              ) : row.alreadyFlagged ? (
                                <span className="action-placeholder">
                                  Flagged
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="btn-subject-impound"
                                  onClick={() => setConfirming(row)}
                                >
                                  Subject to Impound
                                </button>
                              )
                            ) : (
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
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
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

      {/* CONFIRM SUBJECT-TO-IMPOUND MODAL */}
      {confirming && (
        <div
          className="modal-backdrop"
          onClick={isFlagging ? undefined : () => setConfirming(null)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Mark as Subject to Impound</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setConfirming(null)}
                disabled={isFlagging}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-description">
                This vehicle will be flagged for impounding and added to the
                Impounding Staff's queue. Continue?
              </p>

              <div className="impound-info-box">
                <div>
                  <span className="impound-info-label">CIN:</span>{" "}
                  {confirming.cin}
                </div>
                <div>
                  <span className="impound-info-label">Plate:</span>{" "}
                  {confirming.plateNo}
                </div>
                <div>
                  <span className="impound-info-label">Location:</span>{" "}
                  {confirming.location}
                </div>
                <div>
                  <span className="impound-info-label">Violation:</span>{" "}
                  {confirming.violation}
                </div>
                <div>
                  <span className="impound-info-label">Clamped by:</span>{" "}
                  {confirming.officer}
                </div>
                <div>
                  <span className="impound-info-label">Clamped:</span>{" "}
                  {formatDateTime(confirming.recordedAt)}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setConfirming(null)}
                disabled={isFlagging}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-confirm"
                onClick={handleMarkSubjectToImpound}
                disabled={isFlagging}
              >
                {isFlagging ? "Confirming..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}