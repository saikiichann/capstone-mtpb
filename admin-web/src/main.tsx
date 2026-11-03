import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { installErrorReporter } from "./lib/errorReporter";
import { reloadForNewVersion } from "./lib/lazyPage";

// Real entries for System Health → Error & Crash Log.
installErrorReporter();

// A page or its CSS from before the last deploy is gone: reload once to get
// the new version instead of failing (see lib/lazyPage.ts).
window.addEventListener("vite:preloadError", (event) => {
  if (reloadForNewVersion()) event.preventDefault();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);