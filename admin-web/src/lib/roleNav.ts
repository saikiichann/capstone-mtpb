import { useLocation } from "react-router-dom";

/* ------------------------------------------------------------------
   roleNav
   Ang OIC pages ay ginagamit din ng Supervisor, pero sa sarili nitong
   routes (/supervisor/...). Ang URL ang nagsasabi kung aling view:

     /dashboard/...   → OIC
     /supervisor/...  → Supervisor (walang Payment/Finance)

   Sa OIC pages, ang sidebar items ay naka-"/dashboard/..."; dito
   pinapalitan ang prefix kapag nasa Supervisor view, para manatili ang
   Supervisor sa sarili niyang mga page.
------------------------------------------------------------------ */

const OIC_BASE = "/dashboard";
const SUPERVISOR_BASE = "/supervisor";

export const isSupervisorPath = (pathname: string): boolean =>
  pathname === SUPERVISOR_BASE || pathname.startsWith(`${SUPERVISOR_BASE}/`);

/** "/dashboard/clamping" → "/supervisor/clamping" sa Supervisor view. */
export const toSupervisorPath = (path: string): string =>
  path === OIC_BASE || path.startsWith(`${OIC_BASE}/`)
    ? SUPERVISOR_BASE + path.slice(OIC_BASE.length)
    : path;

export function useRoleNav() {
  const { pathname } = useLocation();
  const isSupervisor = isSupervisorPath(pathname);

  return {
    isSupervisor,
    /** Label sa ilalim ng "MTPB" sa sidebar */
    roleLabel: isSupervisor ? "Supervisor" : "Officer in Charge",
    /** Sidebar path para sa kasalukuyang view */
    toPath: (path: string): string => (isSupervisor ? toSupervisorPath(path) : path),
    /** Walang Payment/Finance ang Supervisor */
    filterGroups: <T extends { label: string }>(groups: T[]): T[] =>
      isSupervisor ? groups.filter((g) => g.label !== "Payment/Finance") : groups,
  };
}
