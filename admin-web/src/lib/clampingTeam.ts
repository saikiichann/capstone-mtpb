/* ------------------------------------------------------------------
   CLAMPING TEAM — District 3

   The system covers one district only, so there is one clamping team
   and one team leader for the whole district.

   - The leader is picked by the IT Admin in User Management
     (users/{uid}.isTeamLeader).
   - Only the IT Admin can read the users collection, so User Management
     also keeps a copy of the leader in settings/clampingTeam, which every
     staff role can read (used by the Operation Scheduler).
------------------------------------------------------------------ */
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

export const CLAMPING_DISTRICT = "District 3";

export const clampingTeamRef = () => doc(db, "settings", "clampingTeam");

export type ClampingTeam = {
  district: string;
  leaderUid: string | null;
  leaderName: string | null;
};

const EMPTY_TEAM: ClampingTeam = {
  district: CLAMPING_DISTRICT,
  leaderUid: null,
  leaderName: null,
};

/** Live District 3 team (leader). `null` while loading. */
export function useClampingTeam(): ClampingTeam | null {
  const [team, setTeam] = useState<ClampingTeam | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      clampingTeamRef(),
      (snap) => {
        const data = snap.data();
        setTeam(
          data
            ? {
                district: (data.district as string) || CLAMPING_DISTRICT,
                leaderUid: (data.leaderUid as string) ?? null,
                leaderName: (data.leaderName as string) ?? null,
              }
            : EMPTY_TEAM
        );
      },
      (err) => {
        console.warn("Clamping team fetch failed:", err.code);
        setTeam(EMPTY_TEAM);
      }
    );
    return () => unsubscribe();
  }, []);

  return team;
}
