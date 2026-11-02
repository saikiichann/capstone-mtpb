import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import { NotificationBell } from "../../components/NotificationBell";
import ReleaseDetailsDrawer from "../../components/ReleaseDetailsDrawer";
import { confirmAndRelease } from "../../lib/releaseFlow";
import {
  buildQueue,
  getQueueStatusClass,
  RELEASE_QUEUE_STATUS,
  type QueueRow,
} from "../../lib/release";
import "./Homepage.css";

import overviewIcon from "../../assets/overview.png";
import queueIcon from "../../assets/queue.png";
import releaseLogIcon from "../../assets/releaselog.png";
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

type ReleaseLogRow = {
  id: string;
  cin: string;
  plateNo: string;
  clearedBy: string;
  dateTime: Timestamp | null;
  durationMinutes: number | null;
};

type NavItem = { label: string; icon: string; path: string; active?: boolean };
type NavGroup = { label: string; items: NavItem[] };

/* ------------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------------ */
const RECENT_LOG_LIMIT = 25;


const NAV_GROUPS: NavGroup[] = [
  {
    label: "Dashboard",
    items: [
      {
        label: "Overview",
        icon: overviewIcon,
        path: "/release-officer",
        active: true,
      },
    ],
  },
  {
    label: "Vehicle Release",
    items: [
      {
        label: "Release Queue",
        icon: queueIcon,
        path: "/release-officer/queue",
      },
      {
        label: "Release Log",
        icon: releaseLogIcon,
        path: "/release-officer/log",
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

const formatDuration = (minutes: number | null): string => {
  if (minutes === null || minutes === undefined) return "—";
  return `${minutes} min`;
};

/* ------------------------------------------------------------------
   MAIN COMPONENT
------------------------------------------------------------------ */
export default function ReleaseOfficerHomepage() {
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "release-officer",
  });
  const [currentUserUid, setCurrentUserUid] = useState<string>("");
  /** The vehicle open in the Release Details panel */
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [queueRows, setQueueRows] = useState<QueueRow[]>([]);
  const [logRows, setLogRows] = useState<ReleaseLogRow[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [logLoading, setLogLoading] = useState(true);

  /* Fetch current user */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) {
        setCurrentUser({ name: "Guest", role: "release-officer" });
        setCurrentUserUid("");
        return;
      }
      setCurrentUserUid(loggedUser.uid);
      try {
        const snap = await getDoc(doc(db, "users", loggedUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          setCurrentUser({
            name: data.name ?? "Unknown",
            role: (data.role ?? "release-officer") as RoleSlug,
          });
        }
      } catch (err) {
        console.error("Failed to load current user:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  /* Queue — only OIC-approved violations reach the release officer */
  useEffect(() => {
    const q = query(
      collection(db, "violations"),
      where("releaseStatus", "==", RELEASE_QUEUE_STATUS)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setQueueRows(buildQueue(snap.docs));
        setQueueLoading(false);
      },
      (err) => {
        console.warn("Queue fetch failed:", err.code);
        setQueueLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  /* Release log — recent history */
  useEffect(() => {
    const q = query(
      collection(db, "releaseLog"),
      orderBy("releasedAt", "desc"),
      limit(RECENT_LOG_LIMIT)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setLogRows(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              cin: data.cin ?? "—",
              plateNo: data.plateNo ?? "—",
              clearedBy: data.releasedBy ?? "—",
              dateTime: data.releasedAt ?? null,
              durationMinutes:
                typeof data.releaseDurationMinutes === "number"
                  ? data.releaseDurationMinutes
                  : null,
            };
          })
        );
        setLogLoading(false);
      },
      (err) => {
        console.warn("Release log fetch failed:", err.code);
        setLogLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  /** Release from the details panel (lib/releaseFlow.ts). */
  const handleRelease = async (violationId: string) => {
    try {
      const outcome = await confirmAndRelease({ violationId, officerName: currentUser.name });
      if (outcome === "released" || outcome === "already-released") setSelectedId(null);
    } catch (err) {
      console.error("Release failed:", err);
      alert((err as Error)?.message || "Failed to mark as released.");
    }
  };

  /* Metrics */
  const metrics = useMemo(() => {
    const readyForRelease = queueRows.filter((r) => r.canRelease).length;
    const inQueue = queueRows.filter((r) => !r.canRelease).length;

    const today = new Date().toDateString();
    const releasedToday = logRows.filter((r) => {
      if (!r.dateTime) return false;
      try {
        return r.dateTime.toDate().toDateString() === today;
      } catch {
        return false;
      }
    }).length;

    const durations = logRows
      .map((r) => r.durationMinutes)
      .filter((d): d is number => typeof d === "number" && d > 0);

    const avg =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null;

    return { readyForRelease, inQueue, releasedToday, avg };
  }, [queueRows, logRows]);

  const metricCards = [
    {
      title: "Ready for Release",
      value: String(metrics.readyForRelease),
      subtitle: "Verified, awaiting handoff",
    },
    {
      title: "In Queue",
      value: String(metrics.inQueue),
      subtitle: "Awaiting payment verification",
    },
    {
      title: "Released Today",
      value: String(metrics.releasedToday),
      subtitle: "",
    },
    {
      title: "Avg. Release Duration",
      value: metrics.avg === null ? "—" : `${metrics.avg} min`,
      subtitle: `Last ${RECENT_LOG_LIMIT} releases`,
    },
  ];

  return (
    <div className="release-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <AppSidebar groups={NAV_GROUPS} role={<>Release Officer</>} />

        {/* MAIN */}
        <div className="main">
          <AppTopbar groups={NAV_GROUPS} />
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

            <div className="header-right-group">
              {currentUserUid && (
                <NotificationBell currentUserUid={currentUserUid} officerName={currentUser.name} />
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

            {/* RELEASE QUEUE */}
            <div className="card">
              <div className="card-header-row">
                <div>
                  <p className="card-eyebrow">Release Management · FIFO</p>
                  <h2 className="card-title">Sector 3 Release Queue</h2>
                </div>
                <button
                  className="card-link"
                  onClick={() => navigate("/release-officer/queue")}
                >
                  View All
                </button>
              </div>

              {queueLoading ? (
                <div className="table-loading">
                  <p>Loading queue...</p>
                </div>
              ) : queueRows.length === 0 ? (
                <div className="table-empty">
                  <p>No vehicles in queue.</p>
                </div>
              ) : (
                <div className="table-wrapper" tabIndex={0} role="region" aria-label="Data table" data-scroll-region>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Queue</th>
                        <th>CIN</th>
                        <th>Plate No.</th>
                        <th>District</th>
                        <th>Waiting</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queueRows.slice(0, 5).map((row) => (
                        <tr key={row.id} className="rd-row" onClick={() => setSelectedId(row.id)}>
                          <td className="cell-queue">{row.queue}</td>
                          <td>
                            <span className="cin-pill">{row.cin}</span>
                          </td>
                          <td className="cell-plate">{row.plateNo}</td>
                          <td className="cell-district">
                            {row.details.district ? (
                              <span className="district-pill">{row.details.district}</span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="cell-waiting">
                            {row.waitingMinutes} min
                          </td>
                          <td>
                            <span
                              className={`status-pill ${getQueueStatusClass(
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

            {/* RELEASE LOG */}
            <div className="card">
              <div className="card-header-row">
                <div>
                  <p className="card-eyebrow">Sector 3 · History</p>
                  <h2 className="card-title">Release Log</h2>
                </div>
                <button
                  className="card-link"
                  onClick={() => navigate("/release-officer/log")}
                >
                  View All
                </button>
              </div>

              {logLoading ? (
                <div className="table-loading">
                  <p>Loading release log...</p>
                </div>
              ) : logRows.length === 0 ? (
                <div className="table-empty">
                  <p>No release history yet.</p>
                </div>
              ) : (
                <div className="table-wrapper" tabIndex={0} role="region" aria-label="Data table" data-scroll-region>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>CIN</th>
                        <th>Plate No.</th>
                        <th>Cleared by</th>
                        <th>Date &amp; Time</th>
                        <th>Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logRows.slice(0, 5).map((row) => (
                        <tr key={row.id}>
                          <td>
                            <span className="cin-pill">{row.cin}</span>
                          </td>
                          <td className="cell-plate">{row.plateNo}</td>
                          <td className="cell-cleared-by">{row.clearedBy}</td>
                          <td className="cell-datetime">
                            {formatDateTime(row.dateTime)}
                          </td>
                          <td className="cell-duration">
                            {formatDuration(row.durationMinutes)}
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
      {selectedId && (
        <ReleaseDetailsDrawer
          violationId={selectedId}
          onClose={() => setSelectedId(null)}
          onRelease={handleRelease}
        />
      )}
    </div>
  );
}