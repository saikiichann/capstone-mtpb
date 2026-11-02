/* ------------------------------------------------------------------
   BACKUP & RESTORE — totoong backup ng Firestore data, ng IT Admin.

   Back up now:
     Binabasa ang bawat collection sa BACKUP_COLLECTIONS, sine-save bilang
     isang JSON file na dina-download ng IT Admin, at nire-record sa
     backupHistory (at audit log). Napapanatili ang mga petsa (Timestamp),
     kaya maibabalik nang eksakto.

   Restore from file:
     Binabasa ang backup file, ikinukumpara sa kasalukuyang database, at
     ibinabalik LANG ang mga record na NAWALA (wala na sa database).
     Hindi kailanman pinapatungan ang record na nandiyan pa, kaya hindi
     mabubura ang mga bagong transaction mula nang ginawa ang backup.

   Bakit hindi automatic gabi-gabi: ang naka-schedule na Firestore export
   ay kailangan ng Firebase Blaze plan (may bayad) at ng server. Sa free
   plan, ang IT Admin ang nagba-back up (inirerekomenda: lingguhan).

   PAALALA: may personal na impormasyon ang backup file (pangalan ng
   driver, plate, contact). Itago sa ligtas na lugar (Data Privacy Act).
------------------------------------------------------------------ */
import {
  GeoPoint,
  Timestamp,
  collection,
  doc,
  getDocs,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { db } from "../firebase";

export const BACKUP_FORMAT = "mtpb-firestore-backup";
export const BACKUP_VERSION = 1;

/** Collections in a backup, in the order they are restored. */
export const BACKUP_COLLECTIONS: { id: string; label: string }[] = [
  { id: "users", label: "Staff accounts" },
  { id: "settings", label: "Settings" },
  { id: "clampingFines", label: "Clamping fines" },
  { id: "impoundingFines", label: "Impounding fines" },
  { id: "counters", label: "Number counters (CIN, REF, OR, ORD)" },
  { id: "clamps", label: "Clamps and QR codes" },
  { id: "clampingTeams", label: "Clamping teams" },
  { id: "violators", label: "Violator accounts" },
  { id: "vehicles", label: "Registered vehicles" },
  { id: "violations", label: "Violations" },
  { id: "impoundRecords", label: "Impound records" },
  { id: "payments", label: "Payments" },
  { id: "releaseLog", label: "Release log" },
  { id: "operationSchedules", label: "Operation schedules" },
  { id: "fieldSubmissions", label: "Field updates" },
  { id: "auditLogs", label: "Audit log" },
  { id: "privacyLogs", label: "Data privacy log" },
  { id: "exportLogs", label: "Export log" },
];

type Encoded =
  | null
  | boolean
  | number
  | string
  | Encoded[]
  | { [key: string]: Encoded };

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  createdBy: string;
  project: string;
  collections: Record<string, { id: string; data: Record<string, Encoded> }[]>;
};

export type CollectionCount = { id: string; label: string; count: number; error?: string };

/* ---- Firestore values ↔ JSON ------------------------------------- */

function encode(value: unknown): Encoded {
  if (value === null || value === undefined) return null;
  if (value instanceof Timestamp) return { __type: "timestamp", ms: value.toMillis() };
  if (value instanceof GeoPoint) return { __type: "geopoint", lat: value.latitude, lng: value.longitude };
  if (Array.isArray(value)) return value.map(encode);
  if (typeof value === "object") {
    // Timestamp-like objects (other SDK copies)
    const v = value as { toMillis?: () => number };
    if (typeof v.toMillis === "function") return { __type: "timestamp", ms: v.toMillis() };
    const out: Record<string, Encoded> = {};
    for (const [k, inner] of Object.entries(value as Record<string, unknown>)) out[k] = encode(inner);
    return out;
  }
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") return value;
  return String(value);
}

function decode(value: Encoded): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(decode);
  if (value.__type === "timestamp" && typeof value.ms === "number") return Timestamp.fromMillis(value.ms);
  if (value.__type === "geopoint" && typeof value.lat === "number" && typeof value.lng === "number") {
    return new GeoPoint(value.lat, value.lng);
  }
  const out: Record<string, unknown> = {};
  for (const [k, inner] of Object.entries(value)) out[k] = decode(inner);
  return out;
}

/* ---- Back up --------------------------------------------------------- */

export async function createBackup(
  createdBy: string,
  onProgress: (label: string, done: number, total: number) => void
): Promise<{ file: BackupFile; counts: CollectionCount[] }> {
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    createdBy,
    project: "mtpb-integrated-enforcem-9e6f8",
    collections: {},
  };
  const counts: CollectionCount[] = [];

  for (let i = 0; i < BACKUP_COLLECTIONS.length; i += 1) {
    const c = BACKUP_COLLECTIONS[i];
    onProgress(c.label, i, BACKUP_COLLECTIONS.length);
    try {
      const snap = await getDocs(collection(db, c.id));
      file.collections[c.id] = snap.docs.map((d) => ({
        id: d.id,
        data: encode(d.data()) as Record<string, Encoded>,
      }));
      counts.push({ id: c.id, label: c.label, count: snap.size });
    } catch (err) {
      counts.push({
        id: c.id,
        label: c.label,
        count: 0,
        error: (err as { code?: string })?.code ?? "read failed",
      });
    }
  }
  onProgress("Done", BACKUP_COLLECTIONS.length, BACKUP_COLLECTIONS.length);
  return { file, counts };
}

/** "mtpb-backup-2026-11-01-1530.json" */
export function backupFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `mtpb-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(
    date.getHours()
  )}${pad(date.getMinutes())}.json`;
}

/** Saves the backup to the IT Admin's computer. Returns its size in bytes. */
export function downloadBackup(file: BackupFile, name: string): number {
  const blob = new Blob([JSON.stringify(file)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return blob.size;
}

/* ---- Restore --------------------------------------------------------- */

/** Reads and checks a backup file chosen by the IT Admin. Throws a readable message. */
export function parseBackup(text: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This is not a backup file (it isn't valid JSON).");
  }
  const f = parsed as Partial<BackupFile>;
  if (!f || f.format !== BACKUP_FORMAT || typeof f.collections !== "object" || !f.collections) {
    throw new Error("This file is not an MTPB backup made by Backup & Restore.");
  }
  if ((f.version ?? 0) > BACKUP_VERSION) {
    throw new Error("This backup was made by a newer version of the admin. Update the admin first.");
  }
  return f as BackupFile;
}

export type RestorePlan = {
  id: string;
  label: string;
  inFile: number;
  missing: { id: string; data: Record<string, Encoded> }[];
}[];

/** Finds which records in the file are no longer in the database. */
export async function planRestore(
  file: BackupFile,
  onProgress: (label: string, done: number, total: number) => void
): Promise<RestorePlan> {
  const known = BACKUP_COLLECTIONS.filter((c) => Array.isArray(file.collections[c.id]));
  const plan: RestorePlan = [];
  for (let i = 0; i < known.length; i += 1) {
    const c = known[i];
    onProgress(c.label, i, known.length);
    const rows = file.collections[c.id];
    const snap = await getDocs(collection(db, c.id));
    const present = new Set(snap.docs.map((d) => d.id));
    plan.push({
      id: c.id,
      label: c.label,
      inFile: rows.length,
      missing: rows.filter((r) => r.id && !present.has(r.id)),
    });
  }
  onProgress("Done", known.length, known.length);
  return plan;
}

/** Puts back the missing records, 400 per batch. Returns how many per collection. */
export async function restoreMissing(
  plan: RestorePlan,
  onProgress: (label: string, done: number, total: number) => void
): Promise<{ restored: Record<string, number>; failed: Record<string, string> }> {
  const restored: Record<string, number> = {};
  const failed: Record<string, string> = {};
  const todo = plan.filter((p) => p.missing.length > 0);
  for (let i = 0; i < todo.length; i += 1) {
    const p = todo[i];
    onProgress(p.label, i, todo.length);
    restored[p.id] = 0;
    try {
      for (let start = 0; start < p.missing.length; start += 400) {
        const batch = writeBatch(db);
        const chunk = p.missing.slice(start, start + 400);
        chunk.forEach((row) => batch.set(doc(db, p.id, row.id), decode(row.data) as DocumentData));
        await batch.commit();
        restored[p.id] += chunk.length;
      }
    } catch (err) {
      failed[p.id] = (err as { code?: string })?.code ?? "write failed";
    }
  }
  onProgress("Done", todo.length, todo.length);
  return { restored, failed };
}

export const formatBytes = (bytes: number): string => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};
