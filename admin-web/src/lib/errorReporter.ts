/* ------------------------------------------------------------------
   ERROR REPORTER — totoong laman ng "Error & Crash Log" (System Health).

   Sinasalo ang mga error habang ginagamit ng staff ang admin:
     - JavaScript error na hindi nahuli (window "error")
     - Promise na pumalya at walang humawak ("unhandledrejection")
     - Firebase error na ini-log ng mga page sa console.error
       (hal. "Missing or insufficient permissions", network failure)

   Sine-save sa errorLogs: oras, severity, saang page, ang mensahe, sino
   ang naka-login. Para hindi bumaha: parehong error isang beses lang kada
   session, at hanggang 15 lang kada session. Naka-login na staff lang ang
   nagre-record (iyon ang pinapayagan ng Firestore rules).
------------------------------------------------------------------ */
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";

type Severity = "Warning" | "Error" | "Critical";

const MAX_PER_SESSION = 15;
const seen = new Set<string>();
let sent = 0;
let writing = false;
let installed = false;

/** Browser noise that isn't a problem in the system. */
const IGNORE = [
  /ResizeObserver loop/i,
  /Script error\.?$/i,
  /AbortError/i,
  /The user aborted a request/i,
  /Load failed$/i,
];

const messageOf = (value: unknown): string => {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "message" in value) {
    const v = value as { code?: unknown; message?: unknown };
    return `${v.code ? `${String(v.code)}: ` : ""}${String(v.message)}`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const isFirebaseError = (value: unknown): boolean =>
  !!value &&
  typeof value === "object" &&
  ((value as { name?: string }).name === "FirebaseError" ||
    typeof (value as { code?: unknown }).code === "string");

const severityOf = (text: string, fallback: Severity): Severity =>
  /permission|insufficient|unauthenticated|quota|resource-exhausted/i.test(text)
    ? "Critical"
    : fallback;

export async function reportError(value: unknown, context = "", fallback: Severity = "Error") {
  const user = auth.currentUser;
  if (!user || sent >= MAX_PER_SESSION || writing) return;
  const text = [context, messageOf(value)].filter(Boolean).join(" — ").replace(/\s+/g, " ").trim();
  if (!text || IGNORE.some((re) => re.test(text))) return;
  const key = `${window.location.pathname}|${text}`;
  if (seen.has(key)) return;
  seen.add(key);
  sent += 1;

  writing = true; // a failing write must not report itself again
  try {
    await addDoc(collection(db, "errorLogs"), {
      timestamp: serverTimestamp(),
      severity: severityOf(text, fallback),
      service: `Admin web · ${window.location.pathname}`.slice(0, 120),
      description: text.slice(0, 500),
      status: "Open",
      uid: user.uid,
      userEmail: user.email ?? "",
    });
  } catch {
    // can't save it (offline, rules): nothing else to do
  } finally {
    writing = false;
  }
}

/** Call once at startup (main.tsx). */
export function installErrorReporter() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    void reportError(event.error ?? event.message, "Page error");
  });

  window.addEventListener("unhandledrejection", (event) => {
    void reportError(event.reason, "Unhandled error");
  });

  // Pages already catch most Firebase errors and print them with
  // console.error("…", err). Those are the ones worth keeping.
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    original(...args);
    const err = args.find((a) => a instanceof Error || isFirebaseError(a));
    if (err) {
      const context = typeof args[0] === "string" ? args[0].replace(/[:\s]+$/, "") : "";
      void reportError(err, context);
    }
  };
}
