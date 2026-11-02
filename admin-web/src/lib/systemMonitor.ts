/* ------------------------------------------------------------------
   SYSTEM MONITOR — totoong health checks para sa IT Admin.

   Serverless ang system (Vercel + Firebase + Supabase), kaya walang
   sariling server na may RAM o disk na masusukat. Ang sinusukat dito ay
   kung SUMASAGOT ang bawat service at GAANO KABILIS:
     - Firestore  (database)          — isang maliit na read, galing server
     - Firebase Authentication        — token refresh (totoong network call)
     - Supabase Storage (photos)      — listahan ng isang file
     - Admin API (Vercel functions)   — /api/client-ip

   Saan napupunta ang resulta:
     - systemHealth/{service}  → System Health table (status, bilis, oras)
     - healthChecks/{YYYY-MM-DD} → bilang ng checks at ilan ang pumasa;
       dito kinukuha ang System Uptime % (nakaraang 30 araw)
     - performanceLogs → kapag mabagal o down ang service, at kung gaano
       katagal nag-load ang dashboard

   Tumatakbo ito mula sa bawat naka-login na staff (kada 5 minuto, kasabay
   ng session heartbeat), pero isang beses lang kada 5 minuto bawat browser.
------------------------------------------------------------------ */
import {
  addDoc,
  collection,
  doc,
  getDocFromServer,
  increment,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { supabase, SUPABASE_BUCKET } from "../supabase";

export type ServiceId = "firestore" | "auth" | "storage" | "api";

export type CheckResult = {
  id: ServiceId;
  name: string;
  ok: boolean;
  /** Response time in ms (0 when it failed). */
  ms: number;
};

export const SERVICES: { id: ServiceId; name: string; order: number }[] = [
  { id: "firestore", name: "Cloud Firestore (database)", order: 1 },
  { id: "auth", name: "Firebase Authentication", order: 2 },
  { id: "storage", name: "Supabase Storage (photos)", order: 3 },
  { id: "api", name: "Admin API (Vercel functions)", order: 4 },
];

/** Slower than this is "Watch"; slower than CRITICAL_MS is "Critical". */
export const WATCH_MS = 1500;
export const CRITICAL_MS = 4000;

const RECORD_EVERY_MS = 5 * 60 * 1000;
const LAST_RECORD_KEY = "mtpb:lastHealthRecord";

const nameOf = (id: ServiceId) => SERVICES.find((s) => s.id === id)?.name ?? id;

async function timed(id: ServiceId, run: () => Promise<boolean>): Promise<CheckResult> {
  const start = performance.now();
  try {
    const ok = await run();
    return { id, name: nameOf(id), ok, ms: ok ? Math.round(performance.now() - start) : 0 };
  } catch {
    return { id, name: nameOf(id), ok: false, ms: 0 };
  }
}

/** Runs the four checks at the same time. Never throws. */
export async function runChecks(): Promise<CheckResult[]> {
  return Promise.all([
    timed("firestore", async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return false;
      // From the server, not the local cache, so it is a real round trip.
      await getDocFromServer(doc(db, "users", uid));
      return true;
    }),
    timed("auth", async () => {
      const user = auth.currentUser;
      if (!user) return false;
      await user.getIdToken(true);
      return true;
    }),
    timed("storage", async () => {
      const { error } = await supabase.storage.from(SUPABASE_BUCKET).list("", { limit: 1 });
      return !error;
    }),
    timed("api", async () => {
      const res = await fetch("/api/client-ip", { cache: "no-store" });
      return res.ok && (res.headers.get("content-type") ?? "").includes("application/json");
    }),
  ]);
}

const today = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const statusOfMs = (ms: number): "Normal" | "Watch" | "Critical" =>
  ms >= CRITICAL_MS ? "Critical" : ms >= WATCH_MS ? "Watch" : "Normal";

/** On localhost (npm run dev) there is no /api, so the API check is left out. */
const apiAvailable = () => !/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

/**
 * Saves one round of checks. Called often, but writes at most once every
 * 5 minutes per browser so the free Firestore quota is not wasted.
 */
export async function recordChecks(results: CheckResult[], force = false): Promise<void> {
  if (!auth.currentUser) return;
  try {
    const last = Number(localStorage.getItem(LAST_RECORD_KEY) ?? 0);
    if (!force && Date.now() - last < RECORD_EVERY_MS) return;
    localStorage.setItem(LAST_RECORD_KEY, String(Date.now()));
  } catch {
    // storage blocked: record anyway
  }

  const counted = results.filter((r) => r.id !== "api" || apiAvailable());
  const allOk = counted.every((r) => r.ok);

  try {
    // Daily totals → System Uptime %.
    const day: Record<string, unknown> = {
      date: today(),
      checks: increment(1),
      okChecks: increment(allOk ? 1 : 0),
      updatedAt: serverTimestamp(),
    };
    counted.forEach((r) => {
      day[`${r.id}Ok`] = increment(r.ok ? 1 : 0);
      day[`${r.id}Ms`] = increment(r.ms);
    });
    await setDoc(doc(db, "healthChecks", today()), day, { merge: true });

    // Latest status per service → System Health table.
    await Promise.all(
      counted.map((r) =>
        setDoc(doc(db, "systemHealth", r.id), {
          name: r.name,
          status: r.ok ? "Online" : "Offline",
          avgResponse: r.ok ? `${r.ms} ms` : "—",
          latencyMs: r.ms,
          lastChecked: serverTimestamp(),
          order: SERVICES.find((s) => s.id === r.id)?.order ?? 9,
        })
      )
    );

    // Only slow or failed checks go to the Performance Log.
    for (const r of counted) {
      if (!r.ok) {
        await logPerformance(`${r.name} did not respond`, "—", "Critical");
      } else if (r.ms >= WATCH_MS) {
        await logPerformance(`${r.name} was slow`, `${r.ms} ms`, statusOfMs(r.ms));
      }
    }
  } catch (err) {
    console.warn("Health check not recorded:", err);
  }
}

export async function logPerformance(
  event: string,
  value: string,
  status: "Normal" | "Watch" | "Critical"
): Promise<void> {
  if (!auth.currentUser) return;
  try {
    await addDoc(collection(db, "performanceLogs"), {
      event: event.slice(0, 200),
      value: value.slice(0, 40),
      status,
      uid: auth.currentUser.uid,
      timestamp: serverTimestamp(),
    });
  } catch {
    // not recorded; nothing else to do
  }
}

/** Runs the checks and saves them (throttled). For the session heartbeat. */
export async function checkAndRecord(): Promise<void> {
  const results = await runChecks();
  await recordChecks(results);
}

/**
 * How long this page took to open (browser Navigation Timing), recorded
 * once per browser session: "Dashboard opened · 1.8 s".
 */
export async function recordPageLoad(): Promise<void> {
  try {
    if (sessionStorage.getItem("mtpb:pageLoadLogged")) return;
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const ms = Math.round(nav?.loadEventEnd || nav?.domComplete || 0);
    if (!ms) return;
    sessionStorage.setItem("mtpb:pageLoadLogged", "1");
    const status = ms >= 8000 ? "Critical" : ms >= 3000 ? "Watch" : "Normal";
    await logPerformance(`Dashboard opened (${window.location.pathname})`, `${(ms / 1000).toFixed(1)} s`, status);
  } catch {
    // ignore
  }
}
