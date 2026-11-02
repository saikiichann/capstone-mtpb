import { useEffect, useState } from "react";
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
  QrCode,
} from "lucide-react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import "./ITAdminHomepage.css";
import "./Settings.css";
import { CLAMP_GRACE_HOURS, CLAMP_OVERDUE_FEE } from "../../lib/clampFee";
import {
  IMPOUND_BASE_FEES,
  IMPOUND_FREE_KM,
  IMPOUND_PER_KM_FEE,
  computeImpoundFee,
  weightClassFromVehicleType,
  type VehicleWeightClass,
} from "../../lib/impoundFlag";

import AppTopbar from "../../components/AppTopbar";
import AppSidebar from "../../components/AppSidebar";

/* ------------------------------------------------------------------
   TYPES
------------------------------------------------------------------ */
type NavItem = {
  label: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  path: string;
  active?: boolean;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

type FineRow = {
  id: string;
  violationType: string;
  amount: number;
};

/* ------------------------------------------------------------------
   ROLE MAP
------------------------------------------------------------------ */

/* ------------------------------------------------------------------
   NAV
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
   FALLBACK DATA (pinagmulan ng auto-seed)
------------------------------------------------------------------ */
const FALLBACK_CLAMPING: FineRow[] = [
  { id: "clamping-blocking-driveway", violationType: "Blocking Driveway", amount: 900 },
  { id: "clamping-blocking-pwd-lane", violationType: "Blocking PWD Lane", amount: 900 },
  { id: "clamping-blocking-fire-hydrant", violationType: "Blocking Fire Hydrant", amount: 900 },
  { id: "clamping-complaint-area", violationType: "Complaint Area", amount: 900 },
  { id: "clamping-no-parking-zone", violationType: "No Parking Zone / Both Sides", amount: 900 },
  { id: "clamping-blocking-pedestrian", violationType: "Blocking Pedestrian Lane", amount: 900 },
  { id: "clamping-blocking-fire-truck", violationType: "Blocking Fire Truck Lane", amount: 900 },
  { id: "clamping-double-parking", violationType: "Double Parking", amount: 900 },
  { id: "clamping-sidewalk-parking", violationType: "Sidewalk Parking", amount: 900 },
  { id: "clamping-street-corner", violationType: "Street Corner Parking", amount: 900 },
  { id: "clamping-left-side", violationType: "Left Side Parking / One Way Street", amount: 900 },
  { id: "clamping-right-side", violationType: "Right Side Parking / One Way Street", amount: 900 },
  { id: "clamping-bridge-top", violationType: "Top of the Bridge Parking", amount: 900 },
  { id: "clamping-obstruction", violationType: "Obstruction", amount: 900 },
  { id: "clamping-loading", violationType: "Loading & Unloading Area", amount: 900 },
];


/* ------------------------------------------------------------------
   IMPOUND FEE (same constants used by Add/Edit Impound Record)
------------------------------------------------------------------ */
/* Vehicle types the impounding staff can pick in Add Impound Record */
const IMPOUND_VEHICLE_TYPES = [
  "PUB", "PUJ", "CAR", "MOTORCYCLE", "TAXI",
  "TRAILER", "TRICYCLE", "VAN", "TRUCK", "OTHERS",
];

const WEIGHT_CLASS_ORDER: VehicleWeightClass[] = ["light", "medium", "heavy"];
const WEIGHT_CLASS_NAMES: Record<VehicleWeightClass, string> = {
  light: "Light",
  medium: "Medium",
  heavy: "Heavy",
};

/* Group the vehicle types using the real classifier, so this table
   always matches what the system computes. */
const IMPOUND_FEE_ROWS = WEIGHT_CLASS_ORDER.map((weightClass) => ({
  weightClass,
  vehicles: IMPOUND_VEHICLE_TYPES.filter(
    (v) => weightClassFromVehicleType(v) === weightClass
  ),
  base: IMPOUND_BASE_FEES[weightClass],
}));

const SAMPLE_KM = 8;
const SAMPLE_FEE = computeImpoundFee("light", SAMPLE_KM);

const peso = (n: number) => `₱${n.toLocaleString()}`;

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */
export default function Settings() {

  const [clamping, setClamping] = useState<FineRow[]>([]);
  const [clampingLoading, setClampingLoading] = useState(true);

  /* ==================================================================
     Real-time: clampingFines — MAY AUTO-SEED
  ================================================================== */
  useEffect(() => {
    const finesRef = collection(db, "clampingFines");
    const finesQuery = query(finesRef, orderBy("order", "asc"));

    const unsubscribe = onSnapshot(
      finesQuery,
      async (snapshot) => {
        if (snapshot.empty) {
          try {
            const batch = writeBatch(db);
            FALLBACK_CLAMPING.forEach((fine, index) => {
              const ref = doc(collection(db, "clampingFines"));
              batch.set(ref, {
                violationType: fine.violationType,
                amount: fine.amount,
                order: index + 1,
              });
            });
            await batch.commit();
          } catch (err) {
            console.error("Auto-seed clamping fines failed:", err);
            setClamping(FALLBACK_CLAMPING);
            setClampingLoading(false);
          }
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
          setClampingLoading(false);
        }
      },
      (error) => {
        console.error("Error fetching clamping fines:", error);
        setClamping(FALLBACK_CLAMPING);
        setClampingLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  return (
    <div className="it-admin-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <AppSidebar groups={navGroups} role={<>IT Admin</>} />

        {/* MAIN */}
        <main className="main">
          <AppTopbar groups={navGroups} />
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
                  <p className="card-subtitle-static">
                    Fixed by ordinance — view only
                  </p>
                </div>

                {clampingLoading ? (
                  <div className="table-loading">
                    <RefreshCw size={20} className="spin" />
                    <p>Loading...</p>
                  </div>
                ) : (
                  <div className="fine-table-wrapper" tabIndex={0} role="region" aria-label="Fines table" data-scroll-region>
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
                            <td className="cell-amount cell-amount-static">
                              {peso(row.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="fee-rule">
                  <p className="fee-rule-formula">
                    Clamping fee = sum of the selected violations
                  </p>
                  <p>
                    Unpaid after {CLAMP_GRACE_HOURS} hours: a fixed{" "}
                    <strong>{peso(CLAMP_OVERDUE_FEE)}</strong> replaces the total.
                  </p>
                </div>
              </article>

              {/* Impound fee */}
              <article className="card settings-card">
                <div className="card-header-static">
                  <h2 className="card-title-static">
                    Impound Fee – Towed Vehicles
                  </h2>
                  <p className="card-subtitle-static">
                    Base fee by vehicle class + towing distance — view only
                  </p>
                </div>

                <div className="fine-table-wrapper" tabIndex={0} role="region" aria-label="Impound fee table" data-scroll-region>
                  <table className="fine-table">
                    <thead>
                      <tr>
                        <th>Vehicle class</th>
                        <th className="col-amount">Base fee (₱)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {IMPOUND_FEE_ROWS.map((row) => (
                        <tr key={row.weightClass}>
                          <td className="cell-violation">
                            {WEIGHT_CLASS_NAMES[row.weightClass]}
                            <span className="cell-sub">
                              {row.vehicles.length ? row.vehicles.join(", ") : "—"}
                            </span>
                          </td>
                          <td className="cell-amount cell-amount-static">
                            {peso(row.base)}
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td className="cell-violation">
                          Towing distance
                          <span className="cell-sub">
                            First {IMPOUND_FREE_KM} km free, then per km
                          </span>
                        </td>
                        <td className="cell-amount cell-amount-static">
                          {peso(IMPOUND_PER_KM_FEE)} / km
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="fee-rule">
                  <p className="fee-rule-formula">
                    Impound fee = base fee + {peso(IMPOUND_PER_KM_FEE)} × (km − {IMPOUND_FREE_KM})
                  </p>
                  <p>
                    Example: CAR towed {SAMPLE_KM} km = {peso(IMPOUND_BASE_FEES.light)} +{" "}
                    {peso(IMPOUND_PER_KM_FEE)} × {SAMPLE_KM - IMPOUND_FREE_KM} ={" "}
                    <strong>{peso(SAMPLE_FEE)}</strong>
                  </p>
                </div>
              </article>
            </div>

            <div style={{ height: 24 }} />
          </div>
        </main>
      </div>
    </div>
  );
}