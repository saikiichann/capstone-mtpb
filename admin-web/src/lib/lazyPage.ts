/* ------------------------------------------------------------------
   lazyPage — React.lazy that survives a new deploy.

   Every page is its own file with a hashed name (ReleaseLog-DQZEUY2v.js).
   After `vercel --prod`, the old file names are gone, so a tab that was
   opened before the deploy fails with "Failed to fetch dynamically
   imported module" when it opens another page (System Health → Error &
   Crash Log). Here the tab reloads once to get the new version instead.
   A second failure within 30 seconds is a real error and is shown/logged.
------------------------------------------------------------------ */
import { lazy, type ComponentType } from "react";

const RELOAD_KEY = "mtpb-new-version-reload";

export const isChunkLoadError = (err: unknown): boolean =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(
    String((err as Error)?.message ?? err)
  );

/** Reloads the page once (per 30 s). Returns false if it already did. */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false; // no storage: don't risk a reload loop
  }
  window.location.reload();
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().catch((err: unknown) => {
      if (isChunkLoadError(err) && reloadForNewVersion()) {
        // The page is reloading; never resolve so nothing renders meanwhile.
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    })
  );
}
