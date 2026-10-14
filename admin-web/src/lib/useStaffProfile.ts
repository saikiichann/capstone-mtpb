import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

/* ------------------------------------------------------------------
   useStaffProfile
   Iisang pinanggagalingan ng profile ng naka-login na staff
   (name, role, assignedLocation) para sa lahat ng Finance pages.

   Bakit may cache: dati, bawat page ay kumukuha ulit ng users doc
   pagbukas. Habang naglo-load, null ang assignedLocation, kaya
   saglit na lumalabas ang data ng LAHAT ng location bago ma-filter.
   Ngayon, isang beses lang kinukuha ang profile kada login, at
   naka-cache sa memory — paglipat ng tab, nandiyan na agad.

   Na-clear ang cache kapag nag-logout o nag-iba ang user. Kapag
   binago ng IT Admin ang assignedLocation, makikita ito pagkatapos
   mag-refresh o mag-login ulit.
------------------------------------------------------------------ */

export type LocationKey = "City Hall" | "Central";

export type StaffProfile = {
  uid: string | null;
  name: string;
  role: string;
  /** "City Hall" | "Central" — gamitin sa filtering */
  assignedLocation: LocationKey | null;
  /** Buong pangalan mula sa users doc — gamitin sa display */
  assignedLocationName: string | null;
};

/** "MTPB Central Market Impounding Area" → "Central", "Manila City Hall" → "City Hall" */
export const normalizeLocation = (raw: unknown): LocationKey | null => {
  const v = String(raw ?? "").toLowerCase();
  if (!v) return null;
  if (v.includes("city") || v.includes("hall")) return "City Hall";
  if (v.includes("central") || v.includes("mtpb")) return "Central";
  return null;
};

let cachedProfile: StaffProfile | null = null;

const initialProfile = (): StaffProfile | null =>
  cachedProfile && auth.currentUser?.uid === cachedProfile.uid
    ? cachedProfile
    : null;

export function useStaffProfile(): { profile: StaffProfile | null; ready: boolean } {
  const [profile, setProfile] = useState<StaffProfile | null>(initialProfile);

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (loggedUser) => {
      if (!loggedUser) {
        cachedProfile = null;
        if (active) {
          setProfile({
            uid: null,
            name: "Guest",
            role: "",
            assignedLocation: null,
            assignedLocationName: null,
          });
        }
        return;
      }

      if (cachedProfile && cachedProfile.uid === loggedUser.uid) {
        if (active) setProfile(cachedProfile);
        return;
      }

      const fallbackName = loggedUser.email?.split("@")[0] ?? "Unknown";

      try {
        const snap = await getDoc(doc(db, "users", loggedUser.uid));
        const data = snap.exists() ? snap.data() : {};
        const next: StaffProfile = {
          uid: loggedUser.uid,
          name: (data.name as string) ?? fallbackName,
          role: (data.role as string) ?? "",
          assignedLocation: normalizeLocation(data.assignedLocation),
          assignedLocationName: (data.assignedLocation as string) ?? null,
        };
        cachedProfile = next;
        if (active) setProfile(next);
      } catch (err) {
        console.error("Error fetching staff profile:", err);
        // Hindi kina-cache — susubukan ulit sa susunod na page.
        if (active) {
          setProfile({
            uid: loggedUser.uid,
            name: fallbackName,
            role: "",
            assignedLocation: null,
            assignedLocationName: null,
          });
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return { profile, ready: profile !== null };
}