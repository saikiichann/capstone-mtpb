/* ------------------------------------------------------------------
   REGISTERED OWNERS — "Registered" vs "Guest" by plate number

   Bakit: laging `violatorUid: null` + `guestId: guest_<PLATE>` ang sinusulat
   ng enforcer app, kahit naka-register (verified) na sa violator app ang
   sasakyan. Kaya kahit registered ang plate, "Guest" ang lumalabas.

   Dito: binabantayan ang `vehicles` na verificationStatus == "active"
   (approved ng MTPB). Kapag walang violatorUid ang isang row pero tugma
   ang plate sa isang active vehicle, ituturing itong Registered — may
   violatorUid ng may-ari at pangalan niya (violators/{uid}.full_name).
   Kapag nag-record ng cash payment mula sa row na ito, nasusulat na rin
   ang violatorUid sa violation at payment (lib/onsitePayment.ts).

   Kailangan ng Firestore rules na mabasa ng staff ang `vehicles` at
   `violators` (tingnan ang firestore.rules). Kapag hindi pa naka-publish,
   walang nababago — Guest pa rin gaya ng dati, walang error.
------------------------------------------------------------------ */
import { useMemo, useSyncExternalStore } from "react";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";

/** "ABC 1234", "ABC-1234" at "abc1234" ay iisang plate. */
export const plateKey = (plate: unknown): string =>
  String(plate ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

type Snapshot = {
  /** plateKey → owner uid */
  owners: Map<string, string>;
  /** uid → full name (null kung hindi makuha) */
  names: Map<string, string | null>;
};

let snapshot: Snapshot = { owners: new Map(), names: new Map() };
const subscribers = new Set<() => void>();
const requestedNames = new Set<string>();
let stopVehicles: (() => void) | null = null;

const emit = () => subscribers.forEach((fn) => fn());

const loadName = async (uid: string) => {
  if (requestedNames.has(uid)) return;
  requestedNames.add(uid);
  let name: string | null = null;
  try {
    const snap = await getDoc(doc(db, "violators", uid));
    const data = snap.exists() ? snap.data() : null;
    name = String(data?.full_name ?? data?.fullName ?? data?.name ?? "").trim() || null;
  } catch (err) {
    console.warn("Registered owner name not loaded:", (err as { code?: string })?.code ?? err);
  }
  const names = new Map(snapshot.names);
  names.set(uid, name);
  snapshot = { ...snapshot, names };
  emit();
};

const startVehicles = () => {
  if (stopVehicles) return;
  stopVehicles = onSnapshot(
    query(collection(db, "vehicles"), where("verificationStatus", "==", "active")),
    (snap) => {
      const owners = new Map<string, string>();
      snap.docs.forEach((d) => {
        const v = d.data();
        const key = plateKey(v.plateNumber ?? v.plateNo);
        const uid = typeof v.ownerUid === "string" ? v.ownerUid : "";
        if (key && uid && !owners.has(key)) owners.set(key, uid);
      });
      snapshot = { ...snapshot, owners };
      emit();
      new Set(owners.values()).forEach((uid) => void loadName(uid));
    },
    (err) => console.warn("Registered vehicles not loaded:", err.code)
  );
};

const subscribe = (fn: () => void) => {
  subscribers.add(fn);
  startVehicles();
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0 && stopVehicles) {
      stopVehicles();
      stopVehicles = null;
    }
  };
};

const getSnapshot = () => snapshot;

type LinkableRow = {
  plateNo?: string | null;
  violatorUid?: string | null;
  violatorName?: string | null;
  guestId?: string | null;
};

/** Ang registered owner ng plate, o null kung wala. */
export const registeredOwnerFor = (
  plateNo: unknown,
  snap: Snapshot = snapshot
): { uid: string; name: string | null } | null => {
  const uid = snap.owners.get(plateKey(plateNo));
  return uid ? { uid, name: snap.names.get(uid) ?? null } : null;
};

/**
 * Pinupunan ang violatorUid / violatorName ng mga row na "Guest" pero
 * registered pala ang plate. Hindi ginagalaw ang row na may violatorUid na.
 */
export function useRegisteredOwners<T extends LinkableRow>(rows: T[]): T[] {
  const snap = useSyncExternalStore(subscribe, getSnapshot);
  return useMemo(
    () =>
      rows.map((row) => {
        if (row.violatorUid) return row;
        const owner = registeredOwnerFor(row.plateNo, snap);
        if (!owner) return row;
        return {
          ...row,
          violatorUid: owner.uid,
          violatorName: owner.name ?? row.violatorName ?? null,
          ...("guestId" in row ? { guestId: null } : {}),
        };
      }),
    [rows, snap]
  );
}

/** Para sa mga export/handler: function na nagbabalik ng owner ng plate. */
export function useRegisteredOwnerLookup(): (
  plateNo: unknown
) => { uid: string; name: string | null } | null {
  const snap = useSyncExternalStore(subscribe, getSnapshot);
  return useMemo(() => (plateNo: unknown) => registeredOwnerFor(plateNo, snap), [snap]);
}

/**
 * The ways one plate may have been typed ("ABC 1234", "ABC1234",
 * "ABC-1234") — Firestore only finds exact matches, so search all of them
 * with where("plateNo", "in", plateSpellings(plate)).
 */
export const plateSpellings = (plate: string): string[] => {
  const clean = String(plate ?? "").toUpperCase().trim().replace(/\s+/g, " ");
  if (!clean) return [];
  const compact = clean.replace(/[\s-]/g, "");
  const parts = clean.split(/[\s-]+/).filter(Boolean);
  // Letters then digits: "ABC1234" → "ABC 1234" / "ABC-1234"
  const split = compact.match(/^([A-Z]+)(\d+)$/);
  const variants = [
    plate,
    clean,
    compact,
    parts.join(" "),
    parts.join("-"),
    ...(split ? [`${split[1]} ${split[2]}`, `${split[1]}-${split[2]}`] : []),
  ];
  return [...new Set(variants.filter(Boolean))].slice(0, 10);
};
