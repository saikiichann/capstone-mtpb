import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import {
  collection,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import { encodedAt } from "../../lib/impoundOrder";
import "./Homepage.css";

// ---------------------------------------------------------------------------
// ASSET IMPORTS
// ---------------------------------------------------------------------------
import overviewIcon from "../../assets/overview.png";
import impoundingLogIcon from "../../assets/impounding.png";
import activeImpoundingIcon from "../../assets/tow-truck.png";
import AppTopbar from "../../components/AppTopbar";
import AppSidebar from "../../components/AppSidebar";

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------


/** BAGONG IMPOUND PROCESS: dalawa lang. */
type ImpoundStatus = "Impounded" | "Released";

type ImpoundRow = {
  id: string;
  uovrNo: string;
  cin: string;
  plateNo: string;
  violation: string;
  location: string;
  officer: string;
  impoundedAt: Timestamp | null;
  /** Order in the list: when the record was saved (lib/impoundOrder.ts). */
  sortKey: number;
  hoursSinceImpound: number;
  impoundFee: number;
  status: ImpoundStatus;
};

type Metrics = {
  currentlyImpounded: number;
  released: number;
  totalFees: number;
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
const PREVIEW_LIMIT = 3;



const INITIAL_METRICS: Metrics = {
  currentlyImpounded: 0,
  released: 0,
  totalFees: 0,
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
        label: "Impound Records",
        icon: impoundingLogIcon,
        path: "/impounding-staff/log",
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

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
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

const computeHoursSince = (ts: Timestamp | null): number => {
  if (!ts) return 0;
  try {
    const date = ts.toDate();
    const now = new Date();
    return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 3600000));
  } catch {
    return 0;
  }
};

const formatCurrency = (n: number): string =>
  `₱${n.toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const getStatusClass = (status: ImpoundStatus): string =>
  status === "Released" ? "status-released" : "status-impounded";

/* ------------------------------------------------------------------
   DETAILS MODAL (view only)
   No status change here: a vehicle is released automatically once its
   impound fee is paid, in cash at the desk or by GCash on the violator
   app. Then it leaves this list on its own.
------------------------------------------------------------------ */
type DetailsModalProps = {
  row: ImpoundRow;
  onClose: () => void;
};

function DetailsModal({ row, onClose }: DetailsModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="impound-details-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title" id="impound-details-title">{row.cin}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="info-box">
            <div className="info-row">
              <span className="info-label">UOVR No.:</span>
              <span className="info-value">{row.uovrNo}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Plate:</span>
              <span className="info-value">{row.plateNo}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Location:</span>
              <span className="info-value">{row.location}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Impounded by:</span>
              <span className="info-value">{row.officer}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Impounded at:</span>
              <span className="info-value">
                {formatDateTime(row.impoundedAt)}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Hours since impound:</span>
              <span className="info-value">{row.hoursSinceImpound} hrs</span>
            </div>
            <div className="info-row">
              <span className="info-label">Impound Fee:</span>
              <span className="info-value">{formatCurrency(row.impoundFee)}</span>
            </div>
          </div>

          <p className="yard-note">
            Not paid yet. Once the impound fee is paid (cash at the desk or GCash), the vehicle is
            released automatically and leaves this list.
          </p>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-cancel" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------------------
export default function ImpoundingStaffHomepage() {
  const navigate = useNavigate();


  const [metrics, setMetrics] = useState<Metrics>(INITIAL_METRICS);
  const [impoundRows, setImpoundRows] = useState<ImpoundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRow, setSelectedRow] = useState<ImpoundRow | null>(null);


  // ---------------------------------------------------------------------
  // EFFECT: Real-time listener for impoundRecords
  // ---------------------------------------------------------------------
  useEffect(() => {
    // Walang orderBy(): tinatanggal ng Firestore ang record na walang
    // clampedAt, kaya hindi lumalabas ang bagong impound. Client-side sort.
    const q = collection(db, "impoundRecords");

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const rows: ImpoundRow[] = snap.docs.map((d) => {
          const data = d.data();
          const impoundedAt: Timestamp | null =
            ((data.clampedAt ?? data.ticketDate ?? data.createdAt) as Timestamp) ?? null;

          return {
            id: d.id,
            uovrNo: data.uovrNo ?? "—",
            cin: data.cin ?? "—",
            plateNo: data.plateNo ?? "—",
            violation:
              data.initialViolation ?? data.violationType ?? data.violation ?? "—",
            location: data.location ?? "—",
            officer:
              data.clampedBy ?? data.towedBy ?? data.impoundedBy ?? "—",
            impoundedAt,
            sortKey: encodedAt(d),
            hoursSinceImpound: computeHoursSince(impoundedAt),
            impoundFee: Number(data.impoundFee ?? 0),
            status: (data.status ?? "Impounded") as ImpoundStatus,
          };
        });

        rows.sort((a, b) => b.sortKey - a.sortKey);

        setImpoundRows(rows);

        const newMetrics: Metrics = { ...INITIAL_METRICS };
        rows.forEach((row) => {
          if (row.status === "Impounded") {
            newMetrics.currentlyImpounded++;
            newMetrics.totalFees += row.impoundFee;
          } else if (row.status === "Released") {
            newMetrics.released++;
          }
        });

        setMetrics(newMetrics);
        setLoading(false);
      },
      (err) => {
        console.warn("Impound records fetch failed:", err.code);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // ---------------------------------------------------------------------
  // EFFECT: Close dropdown when clicking outside
  // ---------------------------------------------------------------------

  // ---------------------------------------------------------------------
  // EFFECT: Close modal when pressing Escape
  // ---------------------------------------------------------------------
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && selectedRow) {
        setSelectedRow(null);
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [selectedRow]);

  // ---------------------------------------------------------------------
  // DERIVED DATA
  // ---------------------------------------------------------------------
  /** Latest entries, newest first. */
  const logPreview = useMemo(
    () => impoundRows.slice(0, PREVIEW_LIMIT),
    [impoundRows]
  );

  /** Only cases that are still in progress (Impounded, not Released). */
  const activePreview = useMemo(
    () =>
      impoundRows
        .filter((row) => row.status === "Impounded")
        .slice(0, PREVIEW_LIMIT),
    [impoundRows]
  );

  // ---------------------------------------------------------------------
  // HANDLERS
  // ---------------------------------------------------------------------



  const metricCards = [
    {
      title: "Currently Impounded",
      value: String(metrics.currentlyImpounded),
      subtitle: "Active vehicles in the yard",
    },
    {
      title: "Released",
      value: String(metrics.released),
      subtitle: "Vehicles claimed",
    },
    {
      title: "Total Impound Fees",
      value: formatCurrency(metrics.totalFees),
      subtitle: "For active impounds",
    },
  ];

  // ---------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------
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
              <h1>Overview</h1>
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
            {/* METRIC CARDS */}
            <div className="metric-grid-three">
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

            {/* IMPOUNDING LOG (PREVIEW) */}
            <div className="card">
              <div className="card-header-row">
                <div>
                  <p className="card-eyebrow">Sector 3</p>
                  <h2 className="card-title">Impound Records</h2>
                </div>
                <button
                  type="button"
                  className="view-all-link"
                  onClick={() => navigate("/impounding-staff/log")}
                >
                  View All
                </button>
              </div>

              {loading ? (
                <div className="table-loading">
                  <p>Loading impounding log...</p>
                </div>
              ) : logPreview.length === 0 ? (
                <div className="table-empty">
                  <p>No impounding activity yet.</p>
                </div>
              ) : (
                <div className="impound-table-wrapper" tabIndex={0} role="region" aria-label="Impound records table" data-scroll-region>
                  <table className="impound-table">
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
                      </tr>
                    </thead>
                    <tbody>
                      {logPreview.map((row) => (
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
                            {formatDateTime(row.impoundedAt)}
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ACTIVE IMPOUNDING OPERATIONS (PREVIEW) */}
            <div className="card">
              <div className="card-header-row">
                <div>
                  <p className="card-eyebrow">Currently in the yard</p>
                  <h2 className="card-title">Vehicles in Yard</h2>
                  <p className="yard-list-note">
                    Unpaid impounds. They leave this list automatically once paid (cash or GCash).
                  </p>
                </div>
                <button
                  type="button"
                  className="view-all-link"
                  onClick={() => navigate("/impounding-staff/active")}
                >
                  View All
                </button>
              </div>

              {loading ? (
                <div className="table-loading">
                  <p>Loading impound records...</p>
                </div>
              ) : activePreview.length === 0 ? (
                <div className="table-empty">
                  <p>No active impounding operations.</p>
                </div>
              ) : (
                <div className="impound-table-wrapper" tabIndex={0} role="region" aria-label="Impound records table" data-scroll-region>
                  <table className="impound-table">
                    <thead>
                      <tr>
                        <th>UOVR No.</th>
                        <th>CIN</th>
                        <th>Plate No.</th>
                        <th>Location</th>
                        <th>Impounded by</th>
                        <th>Impounded</th>
                        <th>Hours</th>
                        <th>Fee</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activePreview.map((row) => (
                        <tr
                          key={row.id}
                          onClick={() => setSelectedRow(row)}
                          className="impound-row-clickable"
                        >
                          <td className="cell-reference">{row.uovrNo}</td>
                          <td>
                            <span className="cin-pill">{row.cin}</span>
                          </td>
                          <td className="cell-plate">{row.plateNo}</td>
                          <td className="cell-location">{row.location}</td>
                          <td className="cell-officer">{row.officer}</td>
                          <td className="cell-time">
                            {formatDateTime(row.impoundedAt)}
                          </td>
                          <td className="cell-overdue">
                            {row.hoursSinceImpound}h
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* UPDATE MODAL */}
      {selectedRow && (
        <DetailsModal row={selectedRow} onClose={() => setSelectedRow(null)} />
      )}
    </div>
  );
}