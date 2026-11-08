// src/pages/impounding-staff/ImpoundingLog.tsx
//
// BAGONG IMPOUND PROCESS:
//   - Hiwalay sa clamp. Walang "Subject to Impound".
//   - Base sa UOVR (Blue Ticket).
//   - Status: "Impounded" / "Released" lang.
//   - Isang data source: impoundRecords.
//   - "Add Record" button → AddImpoundModal (standalone, walang prefill).
//   - "View Record" button → same modal, read-only view.

import { useState, useEffect, useMemo } from "react";
import {
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import { encodedAt } from "../../lib/impoundOrder";
import { useWithDirectImpounds, violationAsImpoundRecord } from "../../lib/directImpounds";
import "./ImpoundingLog.css";
import AddImpoundModal from "./AddImpoundModal";

// Assets
import overviewIcon from "../../assets/overview.png";
import impoundingLogIcon from "../../assets/impounding.png";
import activeImpoundingIcon from "../../assets/tow-truck.png";
import AppTopbar from "../../components/AppTopbar";
import AppSidebar from "../../components/AppSidebar";

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

type LogStatus = "Impounded" | "Released";

type ImpoundLogRow = {
  id: string;
  recordId: string;
  uovrNo: string;
  reference: string | null;
  cin: string;
  plateNo: string;
  violation: string;
  location: string;
  officer: string;
  recordedAt: Timestamp | null;
  /** Order in the list: when the record was saved (lib/impoundOrder.ts). */
  sortKey: number;
  impoundFee: number;
  status: LogStatus;
  /** Enforcer-issued impound (violations), no impound record */
  fromViolation?: boolean;
};

type NavItem = { label: string; icon: string; path: string; active?: boolean };
type NavGroup = { label: string; items: NavItem[] };

/* ------------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------------ */
const ITEMS_PER_PAGE = 10;
const ALL_VIOLATIONS = "All Violations";


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
        label: "Impound Records",
        icon: impoundingLogIcon,
        path: "/impounding-staff/log",
        active: true,
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Vehicles in Yard",
        icon: activeImpoundingIcon,
        path: "/impounding-staff/active",
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


const formatCurrency = (n: number): string =>
  `₱${n.toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const normalizeStatus = (raw: unknown): LogStatus => {
  const v = String(raw ?? "").toLowerCase().trim();
  return v === "released" ? "Released" : "Impounded";
};

const getStatusClass = (status: LogStatus): string =>
  status === "Released" ? "status-released" : "status-impounded";

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function ImpoundingLog() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "impounding-staff",
  });

  const [recordLogs, setLogs] = useState<ImpoundLogRow[]>([]);
  /** + impounds issued by the enforcer app (lib/directImpounds.ts) */
  const logs: ImpoundLogRow[] = useWithDirectImpounds(recordLogs);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [violationFilter, setViolationFilter] = useState(ALL_VIOLATIONS);
  const [currentPage, setCurrentPage] = useState(1);

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

  /* Fetch impoundRecords */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "impoundRecords"),
      (snap) => {
        const rows: ImpoundLogRow[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              recordId: d.id,
              uovrNo: data.uovrNo ?? "—",
              reference:
                (data.referenceNumber as string) ??
                (data.paymentReference as string) ??
                null,
              cin: data.cin ?? "—",
              plateNo: data.plateNo ?? "—",
              violation:
                data.initialViolation ??
                data.violationType ??
                data.violation ??
                "—",
              location: data.location ?? "—",
              officer:
                data.clampedBy ??
                data.towedBy ??
                data.impoundedBy ??
                "—",
              recordedAt: ((data.clampedAt ?? data.ticketDate ?? data.createdAt) as Timestamp) ?? null,
              sortKey: encodedAt(d),
              impoundFee: Number(data.impoundFee ?? 0),
              status: normalizeStatus(data.status),
            };
          })
          .sort((a, b) => b.sortKey - a.sortKey);

        setLogs(rows);
        setLoading(false);
      },
      (err) => {
        console.warn("impoundRecords fetch failed:", err.code);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  /* Violation filter options */
  const violationOptions = useMemo(() => {
    const unique = new Set<string>();
    logs.forEach((row) => {
      if (row.violation && row.violation !== "—") unique.add(row.violation);
    });
    return [ALL_VIOLATIONS, ...Array.from(unique).sort()];
  }, [logs]);

  /* Search + filter */
  const filteredLogs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return logs.filter((row) => {
      const matchesSearch =
        !q ||
        row.cin.toLowerCase().includes(q) ||
        row.plateNo.toLowerCase().includes(q) ||
        row.location.toLowerCase().includes(q) ||
        row.violation.toLowerCase().includes(q) ||
        row.uovrNo.toLowerCase().includes(q);
      const matchesViolation =
        violationFilter === ALL_VIOLATIONS || row.violation === violationFilter;
      return matchesSearch && matchesViolation;
    });
  }, [logs, searchQuery, violationFilter]);

  /* Counts */
  const impoundedCount = useMemo(
    () => logs.filter((r) => r.status === "Impounded").length,
    [logs]
  );
  const releasedCount = useMemo(
    () => logs.filter((r) => r.status === "Released").length,
    [logs]
  );

  /* Pagination */
  const totalPages = Math.max(
    1,
    Math.ceil(filteredLogs.length / ITEMS_PER_PAGE)
  );
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const paginatedLogs = filteredLogs.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  );

  // Back to page 1 when these change (during render, not in an effect)
  const pageResetKey = JSON.stringify([searchQuery, violationFilter]);
  const [prevPageResetKey, setPrevPageResetKey] = useState(pageResetKey);
  if (pageResetKey !== prevPageResetKey) {
    setPrevPageResetKey(pageResetKey);
    setCurrentPage(1);
  }

  return (
    <div className="impounding-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <AppSidebar groups={navGroups} role={<>Impounding Staff</>} />

        {/* MAIN CONTENT */}
        <div className="main">
          <AppTopbar groups={navGroups} />
          <header className="main-header">
            <div>
              <h1>Impound Records</h1>
              <p>
                {new Date().toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>

          </header>

          <main className="main-content">
            {/* SEARCH + FILTER TOOLBAR */}
            <div className="log-toolbar">
              <div className="log-search">
                <input
                  type="text"
                  className="log-search-input"
                  placeholder="Search UOVR, CIN, Plate No..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                />
                <Search size={20} className="log-search-icon" />
              </div>

              <div className="log-filter">
                <select
                  aria-label="Filter by violation"
                  className="log-filter-select"
                  value={violationFilter}
                  onChange={(e) => {
                    setViolationFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  {violationOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <ChevronDown size={20} className="log-filter-icon" />
              </div>
            </div>

            {/* IMPOUNDING LOG TABLE */}
            <div className="card log-card">
              <div className="log-header">
                <div>
                  <p className="card-eyebrow">Sector 3</p>
                  <h2 className="card-title">Impound Records</h2>
                </div>
                <div className="log-header-actions">
                  <p className="log-total">
                    Impounded: <strong>{impoundedCount}</strong>
                    {" · "}
                    Released: <strong>{releasedCount}</strong>
                  </p>
                  <button
                    type="button"
                    className="btn-add-impound"
                    onClick={() => setIsAddOpen(true)}
                  >
                    <Plus size={16} />
                    Add Record
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="table-loading">
                  <p>Loading impounding log...</p>
                </div>
              ) : paginatedLogs.length === 0 ? (
                <div className="table-empty">
                  <p>
                    {logs.length === 0
                      ? "No impounding records found."
                      : "No records match your search or filter."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="log-table-wrapper">
                    <table className="log-table">
                      <thead>
                        <tr>
                          <th>UOVR No.</th>
                          <th>CIN</th>
                          <th>Plate No.</th>
                          <th>Violation</th>
                          <th>Location</th>
                          <th>Impounded by</th>
                          <th>Time</th>
                          <th>Fee</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedLogs.map((row) => (
                          <tr key={row.id}>
                            <td className="cell-reference">{row.uovrNo}</td>
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
                            <td className="cell-fee">
                              {formatCurrency(row.impoundFee)}
                            </td>
                            <td>
                              <span
                                className={`status-pill ${getStatusClass(
                                  row.status
                                )}`}
                              >
                                {row.status}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn-view-record"
                                onClick={() => setViewingId(row.recordId)}
                              >
                                View Record
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* PAGINATION */}
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
                      <span className="pagination-sep">
                        of {totalPages} pages
                      </span>
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
                </>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* ADD IMPOUND MODAL */}
      {isAddOpen && (
        <AddImpoundModal
          onClose={() => setIsAddOpen(false)}
          onSaved={() => {
            // onSnapshot handles the refresh automatically
          }}
          currentUserName={currentUser.name}
        />
      )}

      {/* VIEW RECORD MODAL (read-only) */}
      {viewingId && (
        <ViewImpoundModal
          recordId={viewingId}
          onClose={() => setViewingId(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   VIEW IMPOUND MODAL (read-only, simple)
------------------------------------------------------------------ */
type ViewImpoundModalProps = {
  recordId: string;
  onClose: () => void;
};

function ViewImpoundModal({ recordId, onClose }: ViewImpoundModalProps) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "impoundRecords", recordId));
        if (snap.exists()) {
          setData(snap.data());
        } else {
          // Enforcer-issued impound: no impound record, show the violation.
          const v = await getDoc(doc(db, "violations", recordId));
          if (v.exists()) setData(violationAsImpoundRecord(v.data()));
        }
      } catch (err) {
        console.error("Failed to load record:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [recordId]);

  const pick = (v: unknown): string => {
    const s = String(v ?? "").trim();
    return s && s !== "null" && s !== "undefined" ? s : "—";
  };

  const fee = Number(data?.impoundFee ?? 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content modal-content-wide"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">Impound Record</h3>
          <button aria-label="Close" className="modal-close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {loading ? (
          <div className="modal-body">
            <p>Loading...</p>
          </div>
        ) : !data ? (
          <div className="modal-body">
            <p>Record not found.</p>
          </div>
        ) : (
          <div className="modal-body">
            <h4 className="form-section-title">UOVR / Ticket</h4>
            <div className="modal-grid">
              <div className="form-group">
                <label>UOVR No.</label>
                <div className="read-only-field">{pick(data.uovrNo)}</div>
              </div>
              <div className="form-group">
                <label>CIN</label>
                <div className="read-only-field">{pick(data.cin)}</div>
              </div>
              <div className="form-group">
                <label>AOR No.</label>
                <div className="read-only-field">{pick(data.aorNo)}</div>
              </div>
              <div className="form-group">
                <label>Street</label>
                <div className="read-only-field">{pick(data.street)}</div>
              </div>
              <div className="form-group">
                <label>City / Mun.</label>
                <div className="read-only-field">{pick(data.cityMun)}</div>
              </div>
            </div>

            <h4 className="form-section-title">Driver</h4>
            <div className="modal-grid">
              <div className="form-group form-group-full">
                <label>Name</label>
                <div className="read-only-field">{pick(data.violatorName)}</div>
              </div>
              <div className="form-group form-group-full">
                <label>Address</label>
                <div className="read-only-field">{pick(data.address)}</div>
              </div>
              <div className="form-group">
                <label>License No.</label>
                <div className="read-only-field">{pick(data.licenseNo)}</div>
              </div>
              <div className="form-group">
                <label>Date of Birth</label>
                <div className="read-only-field">{pick(data.dateOfBirth)}</div>
              </div>
            </div>

            <h4 className="form-section-title">Vehicle</h4>
            <div className="modal-grid">
              <div className="form-group">
                <label>Plate No.</label>
                <div className="read-only-field">{pick(data.plateNo)}</div>
              </div>
              <div className="form-group">
                <label>Vehicle Type</label>
                <div className="read-only-field">{pick(data.vehicleType)}</div>
              </div>
              <div className="form-group">
                <label>Color</label>
                <div className="read-only-field">{pick(data.color)}</div>
              </div>
              <div className="form-group">
                <label>MV File</label>
                <div className="read-only-field">{pick(data.mvFile)}</div>
              </div>
              <div className="form-group form-group-full">
                <label>Owner</label>
                <div className="read-only-field">{pick(data.vehicleOwner)}</div>
              </div>
              <div className="form-group form-group-full">
                <label>Owner Address</label>
                <div className="read-only-field">
                  {pick(data.vehicleOwnerAddress)}
                </div>
              </div>
            </div>

            <h4 className="form-section-title">Violation</h4>
            <div className="modal-grid">
              <div className="form-group form-group-full">
                <label>Initial Violation</label>
                <div className="read-only-field">
                  {pick(data.initialViolation)}
                </div>
              </div>
              <div className="form-group form-group-full">
                <label>Impound Violations</label>
                <div className="read-only-field">
                  {Array.isArray(data.impoundViolations) &&
                  data.impoundViolations.length > 0
                    ? (data.impoundViolations as string[]).join(", ")
                    : "—"}
                </div>
              </div>
            </div>

            <h4 className="form-section-title">Apprehension</h4>
            <div className="modal-grid">
              <div className="form-group">
                <label>Apprehending Officer</label>
                <div className="read-only-field">
                  {pick(data.apprehendingOfficer)}
                </div>
              </div>
              <div className="form-group">
                <label>Deputation No.</label>
                <div className="read-only-field">
                  {pick(data.deputationNo)}
                </div>
              </div>
            </div>

            <h4 className="form-section-title">Location &amp; Fee</h4>
            <div className="modal-grid">
              <div className="form-group">
                <label>Impound Location</label>
                <div className="read-only-field">{pick(data.location)}</div>
              </div>
              <div className="form-group">
                <label>Distance (km)</label>
                <div className="read-only-field">{pick(data.distanceKm)}</div>
              </div>
              <div className="form-group">
                <label>Weight Class</label>
                <div className="read-only-field">{pick(data.weightClass)}</div>
              </div>
              <div className="form-group">
                <label>Impound Fee</label>
                <div className="read-only-field fee-value">
                  ₱{fee.toLocaleString()}
                </div>
              </div>
            </div>

            <h4 className="form-section-title">Turn-over</h4>
            <div className="modal-grid">
              <div className="form-group">
                <label>Received By</label>
                <div className="read-only-field">{pick(data.receivedBy)}</div>
              </div>
            </div>

            <h4 className="form-section-title">System</h4>
            <div className="modal-grid">
              <div className="form-group">
                <label>Status</label>
                <div className="read-only-field">{pick(data.status)}</div>
              </div>
              <div className="form-group">
                <label>Created By</label>
                <div className="read-only-field">{pick(data.createdBy)}</div>
              </div>
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}