import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { installErrorReporter } from "./lib/errorReporter";

// Real entries for System Health → Error & Crash Log.
installErrorReporter();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);