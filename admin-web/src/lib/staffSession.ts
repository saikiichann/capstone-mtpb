/* ------------------------------------------------------------------
   STAFF SESSIONS — para sa Session Monitor ng IT Admin.

   - Pag-login (o pagbukas ng dashboard na naka-login na), gumagawa ng
     sessions/{id} na may pangalan, role, device at IP address.
   - Habang bukas ang dashboard, ina-update ang lastActive kada 5 minuto.
     Sa Session Monitor, "active" lang ang may lastActive sa huling 30 min.
   - Pag-logout, sinasara (active: false, endedAt).
   - Kapag ni-Revoke ng IT Admin (revoked: true), mala-logout agad ang user.

   Ang IP ay galing sa /api/client-ip (Vercel function ng admin project),
   kasi hindi kayang alamin ng browser ang sarili nitong public IP. Sa
   localhost (npm run dev) walang function, kaya "—" ang IP doon.
------------------------------------------------------------------ */
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";

const SESSION_KEY = "mtpb:session";
const IP_KEY = "mtpb:clientIp";

/** How often an open dashboard says "still here". */
export const HEARTBEAT_MS = 5 * 60 * 1000;
/** Sessions quiet for longer than this are not shown as active. */
export const ACTIVE_WINDOW_MS = 30 * 60 * 1000;

type StoredSession = { id: string; uid: string };

const readStored = (): StoredSession | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
};

const writeStored = (value: StoredSession | null) => {
  try {
    if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // storage blocked: the session still works for this page load
  }
};

/** This browser's session id for `uid`, if one was started. */
export const currentSessionId = (uid: string): string | null => {
  const stored = readStored();
  return stored && stored.uid === uid ? stored.id : null;
};

/** The IP found at sign-in (for audit logs), or "—". */
export const clientIp = (): string => {
  try {
    return sessionStorage.getItem(IP_KEY) || localStorage.getItem(IP_KEY) || "—";
  } catch {
    return "—";
  }
};

async function fetchClientIp(): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch("/api/client-ip", { cache: "no-store", signal: controller.signal });
    clearTimeout(timer);
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.includes("application/json")) return "—";
    const data = (await res.json()) as { ip?: unknown };
    const ip = typeof data.ip === "string" ? data.ip.trim() : "";
    return /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : "—";
  } catch {
    return "—";
  }
}

/** "Chrome · Windows", "Edge · Android", … */
export function describeDevice(ua: string = navigator.userAgent): string {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Unknown OS";
  return `${browser} · ${os}`;
}

let starting: Promise<string | null> | null = null;

/**
 * Makes sure this browser has an open session for the signed-in staff
 * member. Safe to call on every page: it only creates one when there is
 * none for this user yet.
 */
export function ensureSession(user: { uid: string; name: string; role: string }): Promise<string | null> {
  const existing = currentSessionId(user.uid);
  if (existing) return Promise.resolve(existing);
  if (starting) return starting;

  starting = (async () => {
    try {
      const ip = await fetchClientIp();
      try {
        sessionStorage.setItem(IP_KEY, ip);
        localStorage.setItem(IP_KEY, ip);
      } catch {
        // ignore
      }
      const ref = await addDoc(collection(db, "sessions"), {
        uid: user.uid,
        userId: user.uid,
        userName: user.name,
        role: user.role,
        device: describeDevice(),
        ipAddress: ip,
        loginTime: serverTimestamp(),
        lastActive: serverTimestamp(),
        active: true,
      });
      writeStored({ id: ref.id, uid: user.uid });
      return ref.id;
    } catch (err) {
      console.warn("Session not recorded:", err);
      return null;
    } finally {
      starting = null;
    }
  })();
  return starting;
}

/** Updates lastActive so the IT Admin sees the session as active. */
export async function touchSession(uid: string): Promise<void> {
  const id = currentSessionId(uid);
  if (!id) return;
  try {
    await updateDoc(doc(db, "sessions", id), { lastActive: serverTimestamp() });
  } catch {
    // e.g. the session was revoked or the account disabled
  }
}

/** Closes this browser's session (call before signing out). */
export async function endSession(): Promise<void> {
  const stored = readStored();
  writeStored(null);
  try {
    sessionStorage.removeItem(IP_KEY);
    localStorage.removeItem(IP_KEY);
  } catch {
    // ignore
  }
  if (!stored) return;
  try {
    await updateDoc(doc(db, "sessions", stored.id), {
      active: false,
      endedAt: serverTimestamp(),
    });
  } catch {
    // already revoked, or the account can no longer write: nothing to close
  }
}

/** Forget the stored session without writing (e.g. it was revoked). */
export const forgetSession = () => writeStored(null);
