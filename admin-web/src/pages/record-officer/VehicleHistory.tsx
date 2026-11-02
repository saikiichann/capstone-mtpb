import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./VehicleHistory.css";

// Asset imports
import overviewIcon from "../../assets/overview.png";
import queueMonitorIcon from "../../assets/queue.png";
import allViolationsIcon from "../../assets/allviolations.png";
import clampingIcon from "../../assets/clamping.png";
import impoundingLogIcon from "../../assets/impounding.png";
import vehicleHistoryIcon from "../../assets/history.png";
import releaseRequestsIcon from "../../assets/releaserequest.png";
import releaseOrdersIcon from "../../assets/releaseorder.png";
import releaseLogIcon from "../../assets/releaselog.png";
import allReportsIcon from "../../assets/reports.png";
import exportCenterIcon from "../../assets/export.png";
import AppTopbar from "../../components/AppTopbar";
import AppSidebar from "../../components/AppSidebar";

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

type TimelineEvent = {
  id: string;
  title: string;
  description: string;
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
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Dashboard",
    items: [
      { label: "Overview", icon: overviewIcon, path: "/record-officer" },
      { label: "Queue Monitor", icon: queueMonitorIcon, path: "/record-officer/queue" },
    ],
  },
  {
    label: "Enforcement",
    items: [
      { label: "All Violations", icon: allViolationsIcon, path: "/record-officer/violations" },
      { label: "Clamping Log", icon: clampingIcon, path: "/record-officer/clamping" },
      { label: "Impounding Log", icon: impoundingLogIcon, path: "/record-officer/impounding" },
      { label: "Vehicle History", icon: vehicleHistoryIcon, path: "/record-officer/vehicle-history", active: true },
    ],
  },
  {
    label: "Vehicle Release",
    items: [
      { label: "Release Requests", icon: releaseRequestsIcon, path: "/record-officer/release-requests" },
      { label: "Release Orders", icon: releaseOrdersIcon, path: "/record-officer/release-orders" },
      { label: "Release Log", icon: releaseLogIcon, path: "/record-officer/release-log" },
    ],
  },
  {
    label: "Reports",
    items: [
      { label: "All Reports", icon: allReportsIcon, path: "/record-officer/reports" },
      { label: "Export Center", icon: exportCenterIcon, path: "/record-officer/export" },
    ],
  },
];

// ---------------------------------------------------------------------------
// HELPER: Format Timestamp for Description
// ---------------------------------------------------------------------------
type EventTimestamp =
  | Date
  | string
  | number
  | { toDate: () => Date };

const formatEventTime = (ts: EventTimestamp | null | undefined): string => {
  if (!ts) return "—";
  try {
    const date =
      typeof ts === "object" && "toDate" in ts
        ? ts.toDate()
        : new Date(ts);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------
export default function VehicleHistory() {

  const [, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "record-officer",
  });

  // Search & Data State
  const [searchQuery, setSearchQuery] = useState("");
  const [activePlate, setActivePlate] = useState<string | null>(null);
  const [history, setHistory] = useState<TimelineEvent[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // EFFECT: Fetch current user
  // -----------------------------------------------------------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) {
        setCurrentUser({ name: "Guest", role: "record-officer" });
        return;
      }
      try {
        const userDocRef = doc(db, "users", loggedUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          setCurrentUser({
            name: data.name ?? "Unknown",
            role: (data.role ?? "record-officer") as RoleSlug,
          });
        } else {
          setCurrentUser({
            name: loggedUser.email?.split("@")[0] ?? "Unknown",
            role: "record-officer",
          });
        }
      } catch (err) {
        console.error("Error fetching current user:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  // -----------------------------------------------------------------------
  // EFFECT: Click-outside for dropdown
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // EFFECT: Real-time listener for vehicle history
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!activePlate) return;

    // Query the "violations" collection where plateNo matches
    const violationsRef = collection(db, "violations");
    const q = query(
      violationsRef,
      where("plateNo", "==", activePlate),
      orderBy("recordedAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setSearchError(null);

        if (snap.empty) {
          setHistory([]);
          setIsSearching(false);
          return;
        }

        // Map Firebase documents to TimelineEvent objects
        const fetchedHistory: TimelineEvent[] = snap.docs.map((doc) => {
          const data = doc.data();
          const time = formatEventTime(data.recordedAt);
          const cin = data.cin ?? "—";

          // Build a dynamic title & description based on violation data
          return {
            id: doc.id,
            title: `${data.violationType ?? "Violation recorded"} — ₱${data.fineAmount ?? 0}`,
            description: `${time} · CIN ${cin} · ${data.status ?? "Pending"}`,
          };
        });

        setHistory(fetchedHistory);
        setIsSearching(false);
      },
      (err) => {
        console.error("Firestore listener error:", err);
        setSearchError("Failed to load vehicle history. Please try again.");
        setIsSearching(false);
      }
    );

    return () => unsubscribe();
  }, [activePlate]);

  // -----------------------------------------------------------------------
  // HANDLERS
  // -----------------------------------------------------------------------

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim().toUpperCase();
    if (!query) return;

    // Reset state and trigger the Firestore listener via activePlate
    setHistory([]);
    setSearchError(null);
    setActivePlate(query);
    setSearchQuery("");
  };

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------
  return (
    <div className="record-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <AppSidebar groups={NAV_GROUPS} role={<>Record Officer</>} />

        {/* MAIN CONTENT */}
        <div className="main">
          <AppTopbar groups={NAV_GROUPS} />
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

          </header>

          <main className="main-content">
            {/* LOOKUP CARD */}
            <div className="lookup-card">
              <div className="lookup-info">
                <p className="lookup-eyebrow">LOOKUP</p>
                <h2 className="lookup-title">Vehicle History</h2>
                <p className="lookup-subtitle">
                  {activePlate ? (
                    <>
                      Showing history for {activePlate}
                      <br />
                      Quiapo, Sector 3
                    </>
                  ) : (
                    "Enter a plate number to view its enforcement history."
                  )}
                </p>
              </div>

              <form className="search-bar" onSubmit={handleSearch}>
                <Search size={18} className="search-bar-icon" />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search Plate Number"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </form>
            </div>

            {/* TIMELINE CARD */}
            {activePlate && (
              <div className="timeline-card">
                <p className="timeline-eyebrow">TIMELINE</p>
                <h3 className="timeline-title">
                  Enforcement history — {activePlate}
                </h3>

                {isSearching ? (
                  <p className="timeline-empty-text">Searching records...</p>
                ) : searchError ? (
                  <p className="timeline-empty-text timeline-error">
                    {searchError}
                  </p>
                ) : history.length === 0 ? (
                  <p className="timeline-empty-text">
                    No enforcement history found for this plate number.
                  </p>
                ) : (
                  <div className="timeline-list">
                    {history.map((event) => (
                      <div key={event.id} className="timeline-item">
                        <div className="timeline-dot" />
                        <div className="timeline-content">
                          <p className="timeline-item-title">{event.title}</p>
                          <p className="timeline-item-subtitle">{event.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
