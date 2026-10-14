import { useState, useEffect, useRef, useMemo } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Activity,
  DatabaseBackup,
  Users,
  ShieldCheck,
  Monitor,
  FileText,
  Lock,
  Settings,
  QrCode,
  Plus,
  Printer,
  Trash2,
  X,
  ExternalLink,
  Search,
  Car,
  Bike,
  AlertTriangle,
  RefreshCw,
  Wrench,
  MapPin,
  UserCheck,
  MoreVertical,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import "./QRManagement.css";

// Asset imports
import logo from "../../assets/mtpb-logo.png";
import avatarImg from "../../assets/user.png";
import logoutIcon from "../../assets/logout.png";
import keyIcon from "../../assets/key.png";

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------
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

type ClampState =
  | "available"
  | "unpaid"
  | "verified"
  | "ready-for-release"
  | "released";

type ClampType = "Car" | "Motorcycle";

type ClampCondition = "good" | "damaged" | "needs-repair" | "lost";

type EnforcementType = "clamped" | "impounded";

type ClampRow = {
  id: string;
  clampId: string;
  clampType: ClampType;
  scanToken: string | null;
  storedStatus: ClampState | null;
  state: ClampState;
  hasStateMismatch: boolean;
  createdAt: Timestamp | null;
  createdBy: string;
  deployedAt: Timestamp | null;
  deployedBy: string | null;
  cin: string | null;
  currentViolationId: string | null;
  paidAt: Timestamp | null;
  readyAt: Timestamp | null;
  releasedAt: Timestamp | null;
  condition: ClampCondition;
  physicalLocation: string | null;
  assignedTo: string | null;
  assignedAt: Timestamp | null;
  notes: string | null;
  lastViolatorUid: string | null;
  lastGuestId: string | null;
  lastViolatorName: string | null;
  lastPlateNo: string | null;
  lastViolationAt: Timestamp | null;
  lastCin: string | null;
};

type ViolationDetails = {
  cin: string;
  clampId: string;
  plateNo: string;
  make: string | null;
  vehicleType: string | null;
  color: string | null;
  violationType: string;
  fineAmount: number;
  convenienceFee: number | null;
  totalPaid: number | null;
  referenceNumber: string | null;
  officer: string;
  location: string;
  recordedAt: Timestamp | null;
  paidAt: Timestamp | null;
  paymentStatus: string;
  paymentMethod: string | null;
  paymentReference: string | null;
  releaseStatus: string;
  enforcementType: EnforcementType;
};

const QR_BASE_URL = "https://mtpb-violators-pwa.vercel.app/scan";

const STATUS_OPTIONS: Array<ClampState | "All Status"> = [
  "All Status",
  "available",
  "unpaid",
  "verified",
  "ready-for-release",
  "released",
];

const STATUS_LABELS: Record<ClampState, string> = {
  available: "Available",
  unpaid: "Unpaid",
  verified: "Verified",
  "ready-for-release": "Ready for Release",
  released: "Released",
};

const CONDITION_OPTIONS: Array<ClampCondition | "All Conditions"> = [
  "All Conditions",
  "good",
  "damaged",
  "needs-repair",
  "lost",
];

const CONDITION_LABELS: Record<ClampCondition, string> = {
  good: "Good",
  damaged: "Damaged",
  "needs-repair": "Needs Repair",
  lost: "Lost",
};

const TYPE_OPTIONS: Array<ClampType | "All Types"> = [
  "All Types",
  "Car",
  "Motorcycle",
];

const ROLE_LABELS: Record<RoleSlug, string> = {
  oic: "Officer-in-Charge",
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
    title: "Dashboard",
    items: [{ label: "Overview", icon: LayoutDashboard, path: "/it-admin" }],
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
      { label: "QR Codes", icon: QrCode, path: "/it-admin/qr-codes", active: true },
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
    items: [{ label: "Settings", icon: Settings, path: "/it-admin/settings" }],
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
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

const formatCurrency = (amount: number): string => {
  return `₱${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const getStatusClass = (status: ClampState): string => {
  const map: Record<ClampState, string> = {
    available: "status-waiting",
    unpaid: "status-pay",
    verified: "status-paid",
    "ready-for-release": "status-ready",
    released: "status-released",
  };
  return map[status] ?? "";
};

const getConditionClass = (condition: ClampCondition): string => {
  const map: Record<ClampCondition, string> = {
    good: "condition-good",
    damaged: "condition-damaged",
    "needs-repair": "condition-needs-repair",
    lost: "condition-lost",
  };
  return map[condition] ?? "";
};

const generateScanToken = (): string => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const buildScanUrl = (token: string): string =>
  `${QR_BASE_URL}?t=${encodeURIComponent(token)}`;

const deriveState = (data: {
  releasedAt: Timestamp | null;
  readyAt: Timestamp | null;
  paidAt: Timestamp | null;
  deployedAt: Timestamp | null;
  cin: string | null;
  currentViolationId: string | null;
}): ClampState => {
  if (data.releasedAt) return "released";
  if (data.readyAt) return "ready-for-release";
  if (data.paidAt) return "verified";
  if (data.deployedAt || data.cin || data.currentViolationId) return "unpaid";
  return "available";
};

const detectClampType = (clampId: string): ClampType | null => {
  const trimmed = clampId.trim().toUpperCase();
  if (/^[A-Z]+-\d+$/.test(trimmed)) return "Motorcycle";
  if (/^\d{2}-\d{2}$/.test(trimmed)) return "Car";
  return null;
};

const validateClampId = (id: string): { valid: boolean; message?: string } => {
  const trimmed = id.trim().toUpperCase();

  if (!trimmed) return { valid: false, message: "Clamp ID is required." };
  if (!/^[A-Z0-9-]+$/.test(trimmed)) {
    return { valid: false, message: "Use only letters, numbers, and dashes." };
  }

  const type = detectClampType(trimmed);
  if (!type) {
    return {
      valid: false,
      message: "Format must be like A-20, R-4, RA-05 (Motorcycle) or 20-04 (Car).",
    };
  }

  return { valid: true };
};

const openPrintWindow = (clampId: string, token: string): void => {
  const printWindow = window.open("", "_blank", "width=600,height=800");
  if (!printWindow) {
    alert("The print window was blocked. Allow pop-ups for this site and try again.");
    return;
  }

  const qrSvgString = renderToStaticMarkup(
    <QRCodeSVG value={buildScanUrl(token)} size={300} level="H" />
  );

  printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Print QR - ${clampId}</title>
          <style>
            @page { size: auto; margin: 5mm; }
            * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
            .qr-block { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
            .qr-block svg { display: block; width: 300px; height: 300px; }
            .qr-id { font-size: 20px; font-weight: 700; color: #000; margin: 0; letter-spacing: 1px; font-family: 'Courier New', monospace; text-align: center; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="qr-block">
            ${qrSvgString}
            <p class="qr-id">${clampId}</p>
          </div>
          <scr` +
    `ipt>
            window.addEventListener("load", function() {
              setTimeout(function() { window.print(); }, 400);
            });
          </scr` +
    `ipt>
        </body>
      </html>
    `);
  printWindow.document.close();
};

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------
export default function QRManagement() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "it-admin",
  });

  const [clamps, setClamps] = useState<ClampRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All Status");
  const [typeFilter, setTypeFilter] = useState<string>("All Types");
  const [conditionFilter, setConditionFilter] = useState<string>("All Conditions");

  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [clampIdInput, setClampIdInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [generatedQrs, setGeneratedQrs] = useState<ClampRow[]>([]);

  const [viewingViolation, setViewingViolation] = useState<ViolationDetails | null>(null);
  const [isLoadingViolation, setIsLoadingViolation] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);

  /* Current user */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) {
        setCurrentUser({ name: "Guest", role: "it-admin" });
        return;
      }
      try {
        const userDocRef = doc(db, "users", loggedUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          setCurrentUser({
            name: data.name ?? "Unknown",
            role: (data.role ?? "it-admin") as RoleSlug,
          });
        } else {
          setCurrentUser({
            name: loggedUser.email?.split("@")[0] ?? "Unknown",
            role: "it-admin",
          });
        }
      } catch (err) {
        console.error("Error fetching current user:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  /* Real-time listener for clamps */
  useEffect(() => {
    const ref = collection(db, "clamps");
    const q = query(ref, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const fetched: ClampRow[] = snap.docs.map((d) => {
          const data = d.data();

          const timestamps = {
            createdAt: (data.createdAt as Timestamp) ?? null,
            deployedAt: (data.deployedAt as Timestamp) ?? null,
            paidAt: (data.paidAt as Timestamp) ?? null,
            readyAt: (data.readyAt as Timestamp) ?? null,
            releasedAt: (data.releasedAt as Timestamp) ?? null,
            cin: (data.cin as string) ?? null,
            currentViolationId: (data.currentViolationId as string) ?? null,
          };

          const storedStatus = (data.status as ClampState | undefined) ?? null;
          const state = deriveState(timestamps);
          const hasStateMismatch = storedStatus !== null && storedStatus !== state;

          return {
            id: d.id,
            clampId: data.clampId ?? data.qrId ?? "—",
            clampType: (data.clampType ?? "Car") as ClampType,
            scanToken: (data.scanToken as string) ?? null,
            storedStatus,
            state,
            hasStateMismatch,
            createdBy: data.createdBy ?? "—",
            deployedBy: data.deployedBy ?? null,
            ...timestamps,
            condition: (data.condition as ClampCondition) ?? "good",
            physicalLocation: (data.physicalLocation as string) ?? null,
            assignedTo: (data.assignedTo as string) ?? null,
            assignedAt: (data.assignedAt as Timestamp) ?? null,
            notes: (data.notes as string) ?? null,
            lastViolatorUid: (data.lastViolatorUid as string) ?? null,
            lastGuestId: (data.lastGuestId as string) ?? null,
            lastViolatorName: (data.lastViolatorName as string) ?? null,
            lastPlateNo: (data.lastPlateNo as string) ?? null,
            lastViolationAt: (data.lastViolationAt as Timestamp) ?? null,
            lastCin: (data.lastCin as string) ?? null,
          };
        });
        setClamps(fetched);
        setLoading(false);
      },
      (err) => {
        console.warn("Clamps fetch failed:", err.code);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  /* Click outside for avatar dropdown + row menus */
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
      const target = event.target as HTMLElement;
      if (!target.closest(".row-menu-wrapper")) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* Stats */
  const stats = useMemo(() => {
    const total = clamps.length;
    const available = clamps.filter((c) => c.state === "available").length;
    const unpaid = clamps.filter((c) => c.state === "unpaid").length;
    const verified = clamps.filter((c) => c.state === "verified").length;
    const readyForRelease = clamps.filter((c) => c.state === "ready-for-release").length;
    const released = clamps.filter((c) => c.state === "released").length;

    const good = clamps.filter((c) => c.condition === "good").length;
    const damaged = clamps.filter((c) => c.condition === "damaged").length;
    const needsRepair = clamps.filter((c) => c.condition === "needs-repair").length;
    const lost = clamps.filter((c) => c.condition === "lost").length;

    return {
      total,
      available,
      unpaid,
      verified,
      readyForRelease,
      released,
      good,
      damaged,
      needsRepair,
      lost,
    };
  }, [clamps]);

  const mismatchedClamps = useMemo(
    () => clamps.filter((c) => c.hasStateMismatch || c.storedStatus === null),
    [clamps]
  );

  const filteredRows = useMemo(() => {
    return clamps.filter((c) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.clampId.toLowerCase().includes(q) ||
        (c.cin && c.cin.toLowerCase().includes(q)) ||
        (c.lastPlateNo && c.lastPlateNo.toLowerCase().includes(q));
      const matchesStatus = statusFilter === "All Status" || c.state === statusFilter;
      const matchesType = typeFilter === "All Types" || c.clampType === typeFilter;
      const matchesCondition =
        conditionFilter === "All Conditions" || c.condition === conditionFilter;
      return matchesSearch && matchesStatus && matchesType && matchesCondition;
    });
  }, [clamps, searchQuery, statusFilter, typeFilter, conditionFilter]);

  const detectedType = useMemo(() => {
    if (!clampIdInput.trim()) return null;
    return detectClampType(clampIdInput);
  }, [clampIdInput]);

  /* Handlers */
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

  const handleChangePassword = () => {
    console.log("Navigating to Change Password...");
    setIsMenuOpen(false);
  };

  const handleRepairStates = async () => {
    if (mismatchedClamps.length === 0) return;

    const summary = mismatchedClamps
      .map((c) => `${c.clampId}: ${c.storedStatus ?? "(wala)"} → ${c.state}`)
      .join("\n");

    if (!confirm(`I-sync ang ${mismatchedClamps.length} clamp(s) base sa timestamps?\n\n${summary}`)) {
      return;
    }

    setIsRepairing(true);
    try {
      const batch = writeBatch(db);
      mismatchedClamps.forEach((c) => {
        batch.update(doc(db, "clamps", c.id), { status: c.state });
      });
      await batch.commit();
      console.log(`Repaired ${mismatchedClamps.length} clamp state(s).`);
    } catch (err: any) {
      console.error("Repair failed:", err);
      alert(err.message || "Failed to repair clamp states.");
    } finally {
      setIsRepairing(false);
    }
  };

  const handleGenerate = async () => {
    setGenerateError("");

    const trimmedId = clampIdInput.trim().toUpperCase();
    const validation = validateClampId(trimmedId);
    if (!validation.valid) {
      setGenerateError(validation.message || "Invalid Clamp ID.");
      return;
    }

    const clampType = detectClampType(trimmedId);
    if (!clampType) {
      setGenerateError("Cannot detect clamp type from this ID format.");
      return;
    }

    setIsGenerating(true);

    try {
      const dupQuery = query(collection(db, "clamps"), where("clampId", "==", trimmedId));
      const dupSnap = await getDocs(dupQuery);

      if (!dupSnap.empty) {
        setGenerateError(`Clamp ID "${trimmedId}" already exists. Please check the physical clamp number.`);
        setIsGenerating(false);
        return;
      }

      const scanToken = generateScanToken();

      const docRef = await addDoc(collection(db, "clamps"), {
        clampId: trimmedId,
        clampType,
        scanToken,
        scanTokenIssuedAt: serverTimestamp(),
        scanTokenIssuedBy: currentUser.name,
        status: "available",
        createdAt: serverTimestamp(),
        createdBy: currentUser.name,
        deployedAt: null,
        deployedBy: null,
        cin: null,
        currentViolationId: null,
        paidAt: null,
        readyAt: null,
        releasedAt: null,
        condition: "good",
        physicalLocation: "Stock Room",
        assignedTo: null,
        assignedAt: null,
        notes: null,
        lastViolatorUid: null,
        lastGuestId: null,
        lastViolatorName: null,
        lastPlateNo: null,
        lastViolationAt: null,
        lastCin: null,
      });

      const newQr: ClampRow = {
        id: docRef.id,
        clampId: trimmedId,
        clampType,
        scanToken,
        storedStatus: "available",
        state: "available",
        hasStateMismatch: false,
        createdAt: null,
        createdBy: currentUser.name,
        deployedAt: null,
        deployedBy: null,
        cin: null,
        currentViolationId: null,
        paidAt: null,
        readyAt: null,
        releasedAt: null,
        condition: "good",
        physicalLocation: "Stock Room",
        assignedTo: null,
        assignedAt: null,
        notes: null,
        lastViolatorUid: null,
        lastGuestId: null,
        lastViolatorName: null,
        lastPlateNo: null,
        lastViolationAt: null,
        lastCin: null,
      };

      setGeneratedQrs([newQr]);
      console.log(`Clamp registered: ${trimmedId} (${clampType})`);
    } catch (err: any) {
      console.error("Error registering QR:", err);
      setGenerateError(err.message || "Failed to register QR code.");
    } finally {
      setIsGenerating(false);
    }
  };

  const issueScanToken = async (clamp: ClampRow, mode: "issue" | "reissue"): Promise<string | null> => {
    const token = generateScanToken();
    try {
      const batch = writeBatch(db);

      batch.update(doc(db, "clamps", clamp.id), {
        scanToken: token,
        scanTokenIssuedAt: serverTimestamp(),
        scanTokenIssuedBy: currentUser.name,
      });

      batch.set(doc(collection(db, "auditLogs")), {
        userName: currentUser.name,
        action:
          mode === "reissue"
            ? `re-issued the QR token for clamp ${clamp.clampId} (old token revoked)`
            : `issued a QR token for clamp ${clamp.clampId}`,
        record: clamp.clampId,
        type: "qr-token",
        metadata: { clampId: clamp.clampId, mode },
        timestamp: serverTimestamp(),
      });

      await batch.commit();
      return token;
    } catch (err: any) {
      console.error("Issuing token failed:", err);
      alert(err.message || "Failed to issue a QR token.");
      return null;
    }
  };

  const handleReissueToken = async (clamp: ClampRow) => {
    setOpenMenuId(null);
    if (clamp.state !== "available") {
      alert(`${clamp.clampId} is currently in use. Its QR has to keep working until the vehicle is released.`);
      return;
    }

    const proceed = confirm(
      `Re-issue the QR token for ${clamp.clampId}?\n\n` +
        `The current QR stops working immediately. You will need to print or engrave a new tag and replace the one on the clamp.`
    );
    if (!proceed) return;

    const token = await issueScanToken(clamp, "reissue");
    if (!token) return;

    if (confirm("Token re-issued. Print the new QR now?")) {
      openPrintWindow(clamp.clampId, token);
    }
  };

  const handleCloseGenerate = () => {
    setIsGenerateOpen(false);
    setGeneratedQrs([]);
    setClampIdInput("");
    setGenerateError("");
  };

  const handlePrintSingle = async (qr: ClampRow) => {
    setOpenMenuId(null);
    let token = qr.scanToken;

    if (!token) {
      const proceed = confirm(
        `${qr.clampId} has no secure QR token yet.\n\n` + `Issue one now and print?`
      );
      if (!proceed) return;

      token = await issueScanToken(qr, "issue");
      if (!token) return;
    }

    openPrintWindow(qr.clampId, token);
  };

  const handleDelete = async (clamp: ClampRow) => {
    setOpenMenuId(null);
    if (clamp.state !== "available") {
      alert("Cannot delete a clamp that has been used. Only 'available' clamps can be deleted.");
      return;
    }
    if (!confirm(`Delete ${clamp.clampId}? This cannot be undone.`)) return;

    try {
      await deleteDoc(doc(db, "clamps", clamp.id));
      console.log("Deleted:", clamp.clampId);
    } catch (err: any) {
      console.error("Delete failed:", err);
      alert(err.message || "Failed to delete.");
    }
  };

  const handleReportDamage = async (clamp: ClampRow) => {
    setOpenMenuId(null);
    const reason = prompt(
      `Report damage for ${clamp.clampId}?\n\nReason (e.g. "Broken lock", "Bent shackle"):`
    );
    if (!reason || !reason.trim()) return;

    try {
      const batch = writeBatch(db);

      batch.update(doc(db, "clamps", clamp.id), {
        condition: "damaged",
        notes: reason.trim(),
        damagedAt: serverTimestamp(),
        damagedBy: currentUser.name,
      });

      batch.set(doc(collection(db, "auditLogs")), {
        userName: currentUser.name,
        action: `reported damage for clamp ${clamp.clampId}: ${reason.trim()}`,
        record: clamp.clampId,
        type: "clamp-damage",
        metadata: { clampId: clamp.clampId, reason: reason.trim() },
        timestamp: serverTimestamp(),
      });

      await batch.commit();
      alert(`✅ ${clamp.clampId} marked as damaged.`);
    } catch (err: any) {
      console.error("Damage report failed:", err);
      alert(err.message || "Failed to report damage.");
    }
  };

  const handleReportLost = async (clamp: ClampRow) => {
    setOpenMenuId(null);
    const location = prompt(
      `Report lost clamp ${clamp.clampId}?\n\nLast seen location:`
    );
    if (location === null) return;

    try {
      const batch = writeBatch(db);

      batch.update(doc(db, "clamps", clamp.id), {
        condition: "lost",
        physicalLocation: location.trim() || "Unknown",
        lostAt: serverTimestamp(),
        lostBy: currentUser.name,
      });

      batch.set(doc(collection(db, "auditLogs")), {
        userName: currentUser.name,
        action: `reported clamp ${clamp.clampId} as LOST (last seen: ${location.trim() || "Unknown"})`,
        record: clamp.clampId,
        type: "clamp-lost",
        metadata: { clampId: clamp.clampId, lastSeen: location.trim() },
        timestamp: serverTimestamp(),
      });

      await batch.commit();
      alert(`⚠️ ${clamp.clampId} marked as lost.`);
    } catch (err: any) {
      console.error("Lost report failed:", err);
      alert(err.message || "Failed to report lost clamp.");
    }
  };

  const handleAssignToTeam = async (clamp: ClampRow) => {
    setOpenMenuId(null);
    const teamName = prompt(
      `Assign ${clamp.clampId} to team?\n\nTeam name (e.g. "Team A", "Team B"):`
    );
    if (!teamName || !teamName.trim()) return;

    try {
      const batch = writeBatch(db);

      batch.update(doc(db, "clamps", clamp.id), {
        assignedTo: teamName.trim(),
        assignedAt: serverTimestamp(),
        assignedBy: currentUser.name,
        physicalLocation: teamName.trim(),
      });

      batch.set(doc(collection(db, "auditLogs")), {
        userName: currentUser.name,
        action: `assigned clamp ${clamp.clampId} to ${teamName.trim()}`,
        record: clamp.clampId,
        type: "clamp-assignment",
        metadata: { clampId: clamp.clampId, teamName: teamName.trim() },
        timestamp: serverTimestamp(),
      });

      await batch.commit();
      alert(`✅ ${clamp.clampId} assigned to ${teamName.trim()}.`);
    } catch (err: any) {
      console.error("Assignment failed:", err);
      alert(err.message || "Failed to assign clamp.");
    }
  };

  const handleViewViolation = async (clamp: ClampRow) => {
    setOpenMenuId(null);
    if (!clamp.currentViolationId) {
      alert("No violation linked to this clamp.");
      return;
    }

    setIsLoadingViolation(true);
    setViewingViolation(null);

    try {
      const violationRef = doc(db, "violations", clamp.currentViolationId);
      const violationSnap = await getDoc(violationRef);

      if (!violationSnap.exists()) {
        alert("Violation record not found.");
        setIsLoadingViolation(false);
        return;
      }

      const data = violationSnap.data();

      const details: ViolationDetails = {
        cin: data.cin ?? "—",
        clampId: data.clampId ?? clamp.clampId,
        plateNo: data.plateNo ?? "—",
        make: data.make ?? null,
        vehicleType: data.vehicleType ?? null,
        color: data.color ?? null,
        violationType: data.violationType ?? "—",
        fineAmount: Number(data.fineAmount ?? 0),
        convenienceFee: data.convenienceFee != null ? Number(data.convenienceFee) : null,
        totalPaid: data.totalPaid != null ? Number(data.totalPaid) : null,
        referenceNumber: data.referenceNumber ?? null,
        officer: data.officer ?? "—",
        location: data.location ?? "—",
        recordedAt: data.recordedAt ?? null,
        paidAt: data.paidAt ?? null,
        paymentStatus: data.paymentStatus ?? "Unpaid",
        paymentMethod: data.paymentMethod || null,
        paymentReference: data.paymentReference || null,
        releaseStatus: data.releaseStatus ?? "Pending",
        enforcementType: (data.enforcementType ?? "clamped") as EnforcementType,
      };

      setViewingViolation(details);
    } catch (err: any) {
      console.error("Error fetching violation:", err);
      alert(err.message || "Failed to fetch violation details.");
    } finally {
      setIsLoadingViolation(false);
    }
  };

  const handleCloseViolationModal = () => {
    setViewingViolation(null);
  };

  /* ------------------------------------------------------------------
     RENDER
  ------------------------------------------------------------------ */
  return (
    <div className="it-admin-page">
      <div className="dashboard">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <img src={logo} alt="MTPB logo" className="sidebar-logo-img" />
            <div>
              <p className="sidebar-brand-name">MTPB</p>
              <p className="sidebar-brand-role">IT Admin</p>
            </div>
          </div>
          <nav className="sidebar-nav">
            {navGroups.map((group) => (
              <div className="nav-group" key={group.title}>
                <p className="nav-group-title">{group.title}</p>
                <ul className="nav-list">
                  {group.items.map((item) => {
                    const IconComponent = item.icon;
                    return (
                      <li key={item.label}>
                        <button
                          type="button"
                          className={`nav-item${item.active ? " active" : ""}`}
                          onClick={() => navigate(item.path)}
                        >
                          <IconComponent size={16} className="nav-icon-svg" />
                          <span>{item.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* MAIN CONTENT */}
        <main className="main">
          <header className="main-header">
            <div>
              <h1>QR Code Management</h1>
              <p>
                {new Date().toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>

            <div className="header-right">
              <div className="avatar-container" ref={dropdownRef}>
                <img
                  src={avatarImg}
                  alt="Account menu"
                  className="avatar-img"
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                />

                {isMenuOpen && (
                  <div className="profile-dropdown" role="menu">
                    <div className="dropdown-header">
                      <p className="dropdown-name">{currentUser.name}</p>
                      <p className="dropdown-role">{ROLE_LABELS[currentUser.role]}</p>
                    </div>
                    <button type="button" className="dropdown-item" onClick={handleChangePassword}>
                      <img src={keyIcon} alt="" className="dropdown-icon" />
                      <span>Change Password</span>
                    </button>
                    <button type="button" className="dropdown-item logout" onClick={handleLogout}>
                      <img src={logoutIcon} alt="" className="dropdown-icon" />
                      <span>Log Out</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <div className="main-content">
            {/* DESYNC BANNER */}
            {!loading && mismatchedClamps.length > 0 && (
              <div className="desync-banner">
                <AlertTriangle size={18} className="desync-icon" />
                <div className="desync-text">
                  <p className="desync-title">
                    {mismatchedClamps.length} clamp(s) may out-of-sync state
                  </p>
                  <p className="desync-sub">
                    The saved <code>status</code> field does not match the timestamps.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleRepairStates}
                  disabled={isRepairing}
                >
                  {isRepairing ? "Syncing..." : "Sync states"}
                </button>
              </div>
            )}

            {/* COMBINED STATS — 6-column grid, aligned rows */}
            <section className="qr-stats-grid">
              {/* Row 1: State stats */}
              <div className="qr-stat-card">
                <p className="qr-stat-label">Total Clamps</p>
                <p className="qr-stat-value">{stats.total}</p>
              </div>
              <div className="qr-stat-card qr-stat-waiting">
                <p className="qr-stat-label">Available</p>
                <p className="qr-stat-value">{stats.available}</p>
              </div>
              <div className="qr-stat-card qr-stat-pay">
                <p className="qr-stat-label">Unpaid</p>
                <p className="qr-stat-value">{stats.unpaid}</p>
              </div>
              <div className="qr-stat-card qr-stat-paid">
                <p className="qr-stat-label">Verified</p>
                <p className="qr-stat-value">{stats.verified}</p>
              </div>
              <div className="qr-stat-card qr-stat-ready">
                <p className="qr-stat-label">Ready</p>
                <p className="qr-stat-value">{stats.readyForRelease}</p>
              </div>
              <div className="qr-stat-card qr-stat-released">
                <p className="qr-stat-label">Released</p>
                <p className="qr-stat-value">{stats.released}</p>
              </div>

              {/* Row 2: Condition stats — aligned sa row 1 */}
              <div className="qr-stat-card condition-good-card">
                <p className="qr-stat-label">Good Condition</p>
                <p className="qr-stat-value">{stats.good}</p>
              </div>
              <div className="qr-stat-card condition-damaged-card">
                <p className="qr-stat-label">Damaged</p>
                <p className="qr-stat-value">{stats.damaged}</p>
              </div>
              <div className="qr-stat-card condition-repair-card">
                <p className="qr-stat-label">Needs Repair</p>
                <p className="qr-stat-value">{stats.needsRepair}</p>
              </div>
              <div className="qr-stat-card condition-lost-card">
                <p className="qr-stat-label">Lost</p>
                <p className="qr-stat-value">{stats.lost}</p>
              </div>
            </section>

            {/* TOOLBAR */}
            <div className="qr-toolbar">
              <div className="qr-toolbar-left">
                <div className="qr-search">
                  <Search size={16} className="qr-search-icon" />
                  <input
                    type="text"
                    placeholder="Search Clamp ID, CIN, or Plate..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="qr-search-input"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="qr-filter-select"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s === "All Status" ? "All Status" : STATUS_LABELS[s as ClampState]}
                    </option>
                  ))}
                </select>

                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="qr-filter-select"
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                <select
                  value={conditionFilter}
                  onChange={(e) => setConditionFilter(e.target.value)}
                  className="qr-filter-select"
                >
                  {CONDITION_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c === "All Conditions"
                        ? "All Conditions"
                        : CONDITION_LABELS[c as ClampCondition]}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                className="btn-generate"
                onClick={() => setIsGenerateOpen(true)}
              >
                <Plus size={18} />
                <span>Register QR</span>
              </button>
            </div>

            {/* TABLE */}
            <div className="card">
              {loading ? (
                <div className="table-loading">
                  <p>Loading QR codes...</p>
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="table-empty">
                  <QrCode size={48} className="empty-icon" />
                  <p>No QR codes found.</p>
                  <p className="empty-sub">
                    {clamps.length === 0
                      ? 'Click "Register QR" to add your first clamp QR code.'
                      : "Try adjusting your filters."}
                  </p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Clamp ID</th>
                        <th>Type</th>
                        <th>Condition</th>
                        <th>Location</th>
                        <th>Assigned To</th>
                        <th>CIN</th>
                        <th>Last Plate</th>
                        <th>State</th>
                        <th>QR Token</th>
                        <th>Created</th>
                        <th aria-label="Actions"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => (
                        <tr key={row.id}>
                          <td className="cell-qr-id">{row.clampId}</td>
                          <td>
                            <span className={`type-pill type-${row.clampType.toLowerCase()}`}>
                              {row.clampType === "Car" ? <Car size={13} /> : <Bike size={13} />}
                              {row.clampType}
                            </span>
                          </td>
                          <td>
                            <span className={`condition-pill ${getConditionClass(row.condition)}`}>
                              {CONDITION_LABELS[row.condition]}
                            </span>
                          </td>
                          <td className="cell-location">{row.physicalLocation ?? "—"}</td>
                          <td className="cell-assigned">{row.assignedTo ?? "—"}</td>
                          <td className="cell-cin">
                            {row.cin ? (
                              <span className="cin-pill">{row.cin}</span>
                            ) : (
                              <span className="cell-empty">—</span>
                            )}
                          </td>
                          <td className="cell-plate">{row.lastPlateNo ?? "—"}</td>
                          <td>
                            <span className={`status-pill ${getStatusClass(row.state)}`}>
                              {STATUS_LABELS[row.state]}
                            </span>
                            {row.hasStateMismatch && (
                              <span
                                title={`Saved: "${row.storedStatus ?? "(none)"}" — derived: "${row.state}"`}
                              >
                                <AlertTriangle
                                  size={14}
                                  className="state-warning-icon"
                                  aria-label="State out of sync"
                                />
                              </span>
                            )}
                          </td>
                          <td>
                            {row.scanToken ? (
                              <span className="status-pill status-released" title="Has secure QR token.">
                                Issued
                              </span>
                            ) : (
                              <span className="status-pill status-pay" title="No token yet.">
                                Missing
                              </span>
                            )}
                          </td>
                          <td className="cell-datetime">{formatDateTime(row.createdAt)}</td>
                          <td className="cell-actions">
                            <div className="row-menu-wrapper">
                              <button
                                type="button"
                                className="btn-icon btn-more"
                                title="Actions"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuId(openMenuId === row.id ? null : row.id);
                                }}
                              >
                                <MoreVertical size={16} />
                              </button>

                              {openMenuId === row.id && (
                                <div className="row-menu" onClick={(e) => e.stopPropagation()}>
                                  {row.currentViolationId && (
                                    <button
                                      type="button"
                                      className="row-menu-item"
                                      onClick={() => handleViewViolation(row)}
                                      disabled={isLoadingViolation}
                                    >
                                      <ExternalLink size={14} />
                                      <span>View Violation</span>
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    className="row-menu-item"
                                    onClick={() => handleAssignToTeam(row)}
                                  >
                                    <UserCheck size={14} />
                                    <span>Assign to Team</span>
                                  </button>

                                  <button
                                    type="button"
                                    className="row-menu-item"
                                    onClick={() => handleReportDamage(row)}
                                  >
                                    <Wrench size={14} />
                                    <span>Report Damage</span>
                                  </button>

                                  <button
                                    type="button"
                                    className="row-menu-item"
                                    onClick={() => handleReportLost(row)}
                                  >
                                    <MapPin size={14} />
                                    <span>Report Lost</span>
                                  </button>

                                  <div className="row-menu-divider" />

                                  <button
                                    type="button"
                                    className="row-menu-item"
                                    onClick={() => handleReissueToken(row)}
                                    disabled={!row.scanToken || row.state !== "available"}
                                  >
                                    <RefreshCw size={14} />
                                    <span>Re-issue Token</span>
                                  </button>

                                  <button
                                    type="button"
                                    className="row-menu-item"
                                    onClick={() => handlePrintSingle(row)}
                                  >
                                    <Printer size={14} />
                                    <span>Print QR</span>
                                  </button>

                                  <div className="row-menu-divider" />

                                  <button
                                    type="button"
                                    className="row-menu-item row-menu-item-danger"
                                    onClick={() => handleDelete(row)}
                                    disabled={row.state !== "available"}
                                  >
                                    <Trash2 size={14} />
                                    <span>Delete</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* REGISTER QR MODAL */}
      {isGenerateOpen && (
        <div className="modal-overlay" onClick={handleCloseGenerate}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {generatedQrs.length > 0 ? "QR Code Registered" : "Register Clamp QR"}
              </h3>
              <button className="modal-close-btn" onClick={handleCloseGenerate}>
                <X size={20} />
              </button>
            </div>

            {generatedQrs.length === 0 ? (
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="clampId">Clamp ID</label>
                  <input
                    id="clampId"
                    type="text"
                    className="form-input"
                    placeholder="e.g. A-20, R-4, 20-04"
                    value={clampIdInput}
                    onChange={(e) => {
                      setClampIdInput(e.target.value.toUpperCase());
                      setGenerateError("");
                    }}
                    disabled={isGenerating}
                    autoFocus
                  />
                  <p className="form-hint">
                    Enter the exact number painted on the physical clamp.
                  </p>
                </div>

                {detectedType && (
                  <div className={`detected-type detected-${detectedType.toLowerCase()}`}>
                    {detectedType === "Car" ? <Car size={18} /> : <Bike size={18} />}
                    <span>
                      <strong>{detectedType}</strong> clamp detected
                    </span>
                  </div>
                )}

                {generateError && <p className="form-error">{generateError}</p>}

                <p className="modal-note">
                  Registering creates a random, unguessable token for this clamp.
                  The clamp starts as <strong>"available"</strong>.
                </p>
              </div>
            ) : (
              <div className="modal-body">
                <p className="modal-success">
                  Successfully registered <strong>{generatedQrs[0].clampId}</strong> (
                  {generatedQrs[0].clampType}) in <strong>available</strong> state.
                </p>

                <div className="generated-qr-grid">
                  {generatedQrs.map((qr) => (
                    <div key={qr.id} className="generated-qr-item">
                      <QRCodeSVG value={buildScanUrl(qr.scanToken ?? "")} size={160} level="H" />
                      <p className="generated-qr-label">{qr.clampId}</p>
                      <p className="generated-qr-type">
                        {qr.clampType === "Car" ? "🚗 Car" : "🏍️ Motorcycle"}
                      </p>
                    </div>
                  ))}
                </div>

                <p className="modal-note">
                  Next: print or engrave this QR on the metal tag, then attach it to the physical clamp.
                </p>
              </div>
            )}

            <div className="modal-footer">
              {generatedQrs.length === 0 ? (
                <>
                  <button
                    className="btn-secondary"
                    onClick={handleCloseGenerate}
                    disabled={isGenerating}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary"
                    onClick={handleGenerate}
                    disabled={isGenerating || !clampIdInput.trim() || !detectedType}
                  >
                    {isGenerating ? "Registering..." : "Register & Generate QR"}
                  </button>
                </>
              ) : (
                <>
                  <button className="btn-secondary" onClick={handleCloseGenerate}>
                    Close
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => handlePrintSingle(generatedQrs[0])}
                  >
                    <Printer size={16} />
                    <span>Print QR</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIOLATION DETAILS MODAL */}
      {viewingViolation && (
        <div className="modal-overlay" onClick={handleCloseViolationModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                Violation Details — {viewingViolation.cin}
              </h3>
              <button className="modal-close-btn" onClick={handleCloseViolationModal}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="violation-header">
                <p className="violation-cin">{viewingViolation.cin}</p>
                <div className="violation-status-row">
                  <span
                    className={`status-pill ${
                      viewingViolation.paymentStatus === "Verified"
                        ? "status-released"
                        : viewingViolation.paymentStatus === "Pending Verification"
                        ? "status-paid"
                        : "status-pay"
                    }`}
                  >
                    {viewingViolation.paymentStatus}
                  </span>
                  <span
                    className={`status-pill ${
                      viewingViolation.enforcementType === "clamped" ? "status-pay" : "status-ready"
                    }`}
                  >
                    {viewingViolation.enforcementType === "clamped" ? "Clamped" : "Impounded"}
                  </span>
                  <span
                    className={`status-pill ${
                      viewingViolation.releaseStatus === "Released"
                        ? "status-released"
                        : viewingViolation.releaseStatus === "Approved by OIC"
                        ? "status-ready"
                        : viewingViolation.releaseStatus === "Awaiting OIC Approval"
                        ? "status-paid"
                        : "status-waiting"
                    }`}
                  >
                    {viewingViolation.releaseStatus}
                  </span>
                </div>
              </div>

              <div className="violation-grid">
                <div className="violation-item">
                  <label>Clamp ID</label>
                  <p>{viewingViolation.clampId}</p>
                </div>
                <div className="violation-item">
                  <label>Plate Number</label>
                  <p>{viewingViolation.plateNo}</p>
                </div>
                {viewingViolation.make && (
                  <div className="violation-item">
                    <label>Make</label>
                    <p>{viewingViolation.make}</p>
                  </div>
                )}
                {viewingViolation.vehicleType && (
                  <div className="violation-item">
                    <label>Vehicle Type</label>
                    <p>{viewingViolation.vehicleType}</p>
                  </div>
                )}
                {viewingViolation.color && (
                  <div className="violation-item">
                    <label>Color</label>
                    <p>{viewingViolation.color}</p>
                  </div>
                )}
                <div className="violation-item">
                  <label>Violation</label>
                  <p>{viewingViolation.violationType}</p>
                </div>
                <div className="violation-item">
                  <label>Location</label>
                  <p>{viewingViolation.location}</p>
                </div>
                <div className="violation-item">
                  <label>Fine Amount</label>
                  <p className="violation-amount">
                    {formatCurrency(viewingViolation.fineAmount)}
                  </p>
                </div>
                {viewingViolation.convenienceFee !== null && (
                  <div className="violation-item">
                    <label>Convenience Fee</label>
                    <p>{formatCurrency(viewingViolation.convenienceFee)}</p>
                  </div>
                )}
                {viewingViolation.totalPaid !== null && (
                  <div className="violation-item">
                    <label>Total Paid</label>
                    <p className="violation-amount">
                      {formatCurrency(viewingViolation.totalPaid)}
                    </p>
                  </div>
                )}
                <div className="violation-item">
                  <label>Officer</label>
                  <p>{viewingViolation.officer}</p>
                </div>
                <div className="violation-item">
                  <label>Recorded</label>
                  <p>{formatDateTime(viewingViolation.recordedAt)}</p>
                </div>
                {viewingViolation.paidAt && (
                  <div className="violation-item">
                    <label>Paid At</label>
                    <p>{formatDateTime(viewingViolation.paidAt)}</p>
                  </div>
                )}
                {viewingViolation.referenceNumber && (
                  <div className="violation-item">
                    <label>Reference Number</label>
                    <p>{viewingViolation.referenceNumber}</p>
                  </div>
                )}
                <div className="violation-item">
                  <label>Payment Method</label>
                  <p>{viewingViolation.paymentMethod ?? "—"}</p>
                </div>
                <div className="violation-item">
                  <label>Payment Reference</label>
                  <p>{viewingViolation.paymentReference ?? "—"}</p>
                </div>
              </div>

              <p className="modal-note">📖 Read-only view. Full violation management is on the Record Officer page.</p>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={handleCloseViolationModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}