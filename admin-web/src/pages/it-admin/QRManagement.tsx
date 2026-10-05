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
  icon: React.ComponentType<{ size?: number; className?: string }>;
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

type EnforcementType = "clamped" | "impounded";

type ClampRow = {
  id: string;
  clampId: string;
  clampType: ClampType;
  /** Opaque random token encoded in the printed QR. Null on older clamps. */
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
      {
        label: "System Health",
        icon: Activity,
        path: "/it-admin/system-health",
      },
      {
        label: "Backup & Restore",
        icon: DatabaseBackup,
        path: "/it-admin/backup",
      },
    ],
  },
  {
    title: "Access Control",
    items: [
      { label: "User Management", icon: Users, path: "/it-admin/users" },
      {
        label: "Roles & Permissions",
        icon: ShieldCheck,
        path: "/it-admin/roles",
      },
      { label: "Session Monitor", icon: Monitor, path: "/it-admin/sessions" },
    ],
  },
  {
    title: "Enforcement Tools",
    items: [
      {
        label: "QR Codes",
        icon: QrCode,
        path: "/it-admin/qr-codes",
        active: true,
      },
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
//
// CIN generation and issueViolationForClamp live in src/lib/enforcement.ts.
// They cannot be exported from here: a .tsx file with non-component exports
// loses Fast Refresh.
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

/**
 * Generates the opaque token that goes into the QR code.
 *
 * 24 random bytes (192 bits) from the browser's cryptographically secure
 * generator, base64url-encoded to 32 characters. It carries no meaning and
 * cannot be guessed or derived from the Clamp ID — the only way to use it is
 * to look it up in the database. Math.random() must NOT be used here: it is
 * predictable.
 */
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

/** The QR encodes only the token. The Clamp ID is never part of the URL. */
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

  if (/^[A-Z]+-\d+$/.test(trimmed)) {
    return "Motorcycle";
  }

  if (/^\d{2}-\d{2}$/.test(trimmed)) {
    return "Car";
  }

  return null;
};

const validateClampId = (id: string): { valid: boolean; message?: string } => {
  const trimmed = id.trim().toUpperCase();

  if (!trimmed) {
    return { valid: false, message: "Clamp ID is required." };
  }

  if (!/^[A-Z0-9-]+$/.test(trimmed)) {
    return { valid: false, message: "Use only letters, numbers, and dashes." };
  }

  const type = detectClampType(trimmed);
  if (!type) {
    return {
      valid: false,
      message:
        "Format must be like A-20, R-4, RA-05 (Motorcycle) or 20-04 (Car).",
    };
  }

  return { valid: true };
};

/** Opens the print window with the QR (token URL) and the clamp label. */
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
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 20px;
              background: #fff;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
            }
            .qr-block {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 8px;
            }
            .qr-block svg {
              display: block;
              width: 300px;
              height: 300px;
            }
            .qr-id {
              font-size: 20px;
              font-weight: 700;
              color: #000;
              margin: 0;
              letter-spacing: 1px;
              font-family: 'Courier New', monospace;
              text-align: center;
            }
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

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    name: "Loading...",
    role: "it-admin",
  });

  const [clamps, setClamps] = useState<ClampRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All Status");
  const [typeFilter, setTypeFilter] = useState<string>("All Types");

  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [clampIdInput, setClampIdInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [generatedQrs, setGeneratedQrs] = useState<ClampRow[]>([]);

  const [viewingViolation, setViewingViolation] =
    useState<ViolationDetails | null>(null);
  const [isLoadingViolation, setIsLoadingViolation] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);

  // -----------------------------------------------------------------------
  // EFFECT: Fetch current user
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // EFFECT: Real-time listener for clamps
  // -----------------------------------------------------------------------
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

          // No "available" fallback — null when truly missing, so a write
          // that forgot the status field is visible instead of hidden.
          const storedStatus = (data.status as ClampState | undefined) ?? null;
          const state = deriveState(timestamps);
          const hasStateMismatch =
            storedStatus !== null && storedStatus !== state;

          if (hasStateMismatch) {
            console.warn(
              `[clamps] State desync sa ${data.clampId ?? d.id}: ` +
                `stored="${storedStatus}" pero derived="${state}". ` +
                `May write na hindi nag-update ng status field.`
            );
          }

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

  // -----------------------------------------------------------------------
  // EFFECT: Click-outside for dropdown
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // COMPUTED: Stats
  // -----------------------------------------------------------------------
  const stats = useMemo(() => {
    const total = clamps.length;
    const available = clamps.filter((c) => c.state === "available").length;
    const unpaid = clamps.filter((c) => c.state === "unpaid").length;
    const verified = clamps.filter((c) => c.state === "verified").length;
    const readyForRelease = clamps.filter(
      (c) => c.state === "ready-for-release"
    ).length;
    const released = clamps.filter((c) => c.state === "released").length;
    return { total, available, unpaid, verified, readyForRelease, released };
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
        (c.cin && c.cin.toLowerCase().includes(q));
      const matchesStatus =
        statusFilter === "All Status" || c.state === statusFilter;
      const matchesType =
        typeFilter === "All Types" || c.clampType === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [clamps, searchQuery, statusFilter, typeFilter]);

  const detectedType = useMemo(() => {
    if (!clampIdInput.trim()) return null;
    return detectClampType(clampIdInput);
  }, [clampIdInput]);

  // -----------------------------------------------------------------------
  // HANDLERS
  // -----------------------------------------------------------------------
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

  /**
   * Writes the derived state of desynced clamps back to Firestore.
   * This is an IT Admin maintenance action — it should not be needed in
   * normal operation once the issuance code is correct.
   */
  const handleRepairStates = async () => {
    if (mismatchedClamps.length === 0) return;

    const summary = mismatchedClamps
      .map((c) => `${c.clampId}: ${c.storedStatus ?? "(wala)"} → ${c.state}`)
      .join("\n");

    if (
      !confirm(
        `I-sync ang ${mismatchedClamps.length} clamp(s) base sa timestamps?\n\n${summary}`
      )
    ) {
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

  /**
   * Step 1 of the QR flow: the IT Admin registers the clamp (Clamp ID + a
   * freshly generated token) BEFORE anything is printed. The clamp starts as
   * "available"; the enforcer's violation record later moves it to "unpaid"
   * and issues the CIN.
   */
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
      const dupQuery = query(
        collection(db, "clamps"),
        where("clampId", "==", trimmedId)
      );
      const dupSnap = await getDocs(dupQuery);

      if (!dupSnap.empty) {
        setGenerateError(
          `Clamp ID "${trimmedId}" already exists. Please check the physical clamp number.`
        );
        setIsGenerating(false);
        return;
      }

      // 192 random bits — a collision is not a realistic concern, so there
      // is no extra uniqueness query.
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

  /**
   * Writes a fresh token and an audit log entry in one batch.
   *
   *  - "issue":   the clamp was registered before tokens existed.
   *  - "reissue": the current token must stop working (tag lost, stolen,
   *               copied, or damaged). The old token is dead the moment this
   *               batch commits, because the server always compares against
   *               the token stored on the clamp.
   *
   * Returns the new token, or null on failure.
   */
  const issueScanToken = async (
    clamp: ClampRow,
    mode: "issue" | "reissue"
  ): Promise<string | null> => {
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

  /**
   * Revokes the current token and issues a new one. Only allowed while the
   * clamp is idle: on a clamped vehicle the violator needs the existing QR
   * to keep working until release.
   */
  const handleReissueToken = async (clamp: ClampRow) => {
    if (clamp.state !== "available") {
      alert(
        `${clamp.clampId} is currently in use. Its QR has to keep working until the vehicle is released — re-issue the token after release.`
      );
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
    let token = qr.scanToken;

    if (!token) {
      const proceed = confirm(
        `${qr.clampId} has no secure QR token yet (it was registered before tokens existed).\n\n` +
          `Issue one now and print? Any QR already printed for this clamp with the old link format will need to be replaced.`
      );
      if (!proceed) return;

      token = await issueScanToken(qr, "issue");
      if (!token) return;
    }

    openPrintWindow(qr.clampId, token);
  };

  const handleDelete = async (clamp: ClampRow) => {
    // Based on derived state, not the stored status — otherwise a clamp with
    // an active violation could be deleted just because its status field
    // happens to say "available".
    if (clamp.state !== "available") {
      alert(
        "Cannot delete a clamp that has been used. Only 'available' clamps can be deleted."
      );
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

  const handleViewViolation = async (clamp: ClampRow) => {
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
        convenienceFee:
          data.convenienceFee != null ? Number(data.convenienceFee) : null,
        totalPaid: data.totalPaid != null ? Number(data.totalPaid) : null,
        referenceNumber: data.referenceNumber ?? null,
        officer: data.officer ?? "—",
        location: data.location ?? "—",
        recordedAt: data.recordedAt ?? null,
        paidAt: data.paidAt ?? null,
        paymentStatus: data.paymentStatus ?? "Unpaid",
        // || instead of ?? so an empty string and the old "—" written by the
        // first version of the issuance code are also treated as missing.
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

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------
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
                      <p className="dropdown-role">
                        {ROLE_LABELS[currentUser.role]}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="dropdown-item"
                      onClick={handleChangePassword}
                    >
                      <img src={keyIcon} alt="" className="dropdown-icon" />
                      <span>Change Password</span>
                    </button>
                    <button
                      type="button"
                      className="dropdown-item logout"
                      onClick={handleLogout}
                    >
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
                    The saved <code>status</code> field does not match the
                    timestamps. What is shown in the table is the correct state
                    based on the timestamps.
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

            {/* STATS */}
            <section className="qr-stats-grid">
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
            </section>

            {/* TOOLBAR */}
            <div className="qr-toolbar">
              <div className="qr-toolbar-left">
                <div className="qr-search">
                  <Search size={16} className="qr-search-icon" />
                  <input
                    type="text"
                    placeholder="Search Clamp ID or CIN..."
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
                      {s === "All Status"
                        ? "All Status"
                        : STATUS_LABELS[s as ClampState]}
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
                        <th>CIN</th>
                        <th>State</th>
                        <th>QR Token</th>
                        <th>Created</th>
                        <th>Deployed</th>
                        <th aria-label="Actions"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => (
                        <tr key={row.id}>
                          <td className="cell-qr-id">{row.clampId}</td>
                          <td>
                            <span
                              className={`type-pill type-${row.clampType.toLowerCase()}`}
                            >
                              {row.clampType === "Car" ? (
                                <Car size={13} />
                              ) : (
                                <Bike size={13} />
                              )}
                              {row.clampType}
                            </span>
                          </td>
                          <td className="cell-cin">
                            {row.cin ? (
                              <span className="cin-pill">{row.cin}</span>
                            ) : (
                              <span className="cell-empty">—</span>
                            )}
                          </td>
                          <td>
                            <span
                              className={`status-pill ${getStatusClass(
                                row.state
                              )}`}
                            >
                              {STATUS_LABELS[row.state]}
                            </span>
                            {row.hasStateMismatch && (
                              <AlertTriangle
                                size={14}
                                className="state-warning-icon"
                                aria-label="State out of sync"
                                title={`Saved in Firestore: "${
                                  row.storedStatus ?? "(none)"
                                }". The state shown is derived from the timestamps.`}
                              />
                            )}
                          </td>
                          <td>
                            {row.scanToken ? (
                              <span
                                className="status-pill status-released"
                                title="This clamp has a secure QR token."
                              >
                                Issued
                              </span>
                            ) : (
                              <span
                                className="status-pill status-pay"
                                title="Registered before tokens existed. Print the QR to issue one."
                              >
                                Missing
                              </span>
                            )}
                          </td>
                          <td className="cell-datetime">
                            {formatDateTime(row.createdAt)}
                          </td>
                          <td className="cell-datetime">
                            {formatDateTime(row.deployedAt)}
                          </td>
                          <td className="cell-actions">
                            {row.currentViolationId && (
                              <button
                                type="button"
                                className="btn-icon"
                                title="View Violation"
                                onClick={() => handleViewViolation(row)}
                                disabled={isLoadingViolation}
                              >
                                <ExternalLink size={16} />
                              </button>
                            )}

                            <button
                              type="button"
                              className="btn-icon"
                              title={
                                !row.scanToken
                                  ? "No token yet — use Print QR to issue one"
                                  : row.state === "available"
                                  ? "Re-issue QR token"
                                  : "Cannot re-issue while the clamp is in use"
                              }
                              onClick={() => handleReissueToken(row)}
                              disabled={!row.scanToken || row.state !== "available"}
                            >
                              <RefreshCw size={16} />
                            </button>

                            <button
                              type="button"
                              className="btn-icon"
                              title="Print QR"
                              onClick={() => handlePrintSingle(row)}
                            >
                              <Printer size={16} />
                            </button>

                            <button
                              type="button"
                              className="btn-icon danger"
                              title={
                                row.state === "available"
                                  ? "Delete"
                                  : "Cannot delete a clamp that has been used"
                              }
                              onClick={() => handleDelete(row)}
                              disabled={row.state !== "available"}
                            >
                              <Trash2 size={16} />
                            </button>
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
                {generatedQrs.length > 0
                  ? "QR Code Registered"
                  : "Register Clamp QR"}
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
                  <div
                    className={`detected-type detected-${detectedType.toLowerCase()}`}
                  >
                    {detectedType === "Car" ? (
                      <Car size={18} />
                    ) : (
                      <Bike size={18} />
                    )}
                    <span>
                      <strong>{detectedType}</strong> clamp detected
                    </span>
                  </div>
                )}

                {generateError && <p className="form-error">{generateError}</p>}

                <p className="modal-note">
                  Registering creates a random, unguessable token for this
                  clamp. The QR code contains only that token — the Clamp ID is
                  not in the link. The clamp starts as{" "}
                  <strong>"available"</strong>. When an enforcer records a
                  violation it becomes <strong>"unpaid"</strong> and a Citation
                  Number (CIN) is issued, then:{" "}
                  <strong>
                    verified → ready-for-release → released
                  </strong>
                  .
                </p>
              </div>
            ) : (
              <div className="modal-body">
                <p className="modal-success">
                  Successfully registered{" "}
                  <strong>{generatedQrs[0].clampId}</strong> (
                  {generatedQrs[0].clampType}) in <strong>available</strong>{" "}
                  state.
                </p>

                <div className="generated-qr-grid">
                  {generatedQrs.map((qr) => (
                    <div key={qr.id} className="generated-qr-item">
                      <QRCodeSVG
                        value={buildScanUrl(qr.scanToken ?? "")}
                        size={160}
                        level="H"
                      />
                      <p className="generated-qr-label">{qr.clampId}</p>
                      <p className="generated-qr-type">
                        {qr.clampType === "Car" ? "🚗 Car" : "🏍️ Motorcycle"}
                      </p>
                    </div>
                  ))}
                </div>

                <p className="modal-note">
                  Next: print or engrave this QR on the metal tag, then attach
                  it to the physical clamp (rivet or screw).
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
                    disabled={
                      isGenerating || !clampIdInput.trim() || !detectedType
                    }
                  >
                    {isGenerating ? "Registering..." : "Register & Generate QR"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn-secondary"
                    onClick={handleCloseGenerate}
                  >
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
              <button
                className="modal-close-btn"
                onClick={handleCloseViolationModal}
              >
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
                        : viewingViolation.paymentStatus ===
                          "Pending Verification"
                        ? "status-paid"
                        : "status-pay"
                    }`}
                  >
                    {viewingViolation.paymentStatus}
                  </span>
                  <span
                    className={`status-pill ${
                      viewingViolation.enforcementType === "clamped"
                        ? "status-pay"
                        : "status-ready"
                    }`}
                  >
                    {viewingViolation.enforcementType === "clamped"
                      ? "Clamped"
                      : "Impounded"}
                  </span>
                  <span
                    className={`status-pill ${
                      viewingViolation.releaseStatus === "Released"
                        ? "status-released"
                        : viewingViolation.releaseStatus === "Approved by OIC"
                        ? "status-ready"
                        : viewingViolation.releaseStatus ===
                          "Awaiting OIC Approval"
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

              <p className="modal-note">
                📖 Read-only view. Full violation management is on the Record
                Officer page.
              </p>
            </div>

            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={handleCloseViolationModal}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}