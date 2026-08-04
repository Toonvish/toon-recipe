import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app";
import { registerServiceWorker } from "@/lib/pwa";
import { applyTheme, readThemePreference } from "@/lib/theme";
import "@/styles/index.css";

// Apply the stored colour scheme before the first paint.
applyTheme(readThemePreference());
// Offline app shell (production only — a SW in front of vite dev breaks HMR).
registerServiceWorker();

const container = document.getElementById("root");
if (!container) throw new Error("#root fehlt in index.html");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
