// Web entry: the same screens as the desktop app, with window.hiremate provided by the web version.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { createWebApi } from "./webApi";
import { AuthGate } from "./AuthGate";
import "@renderer/styles.css";

window.hiremate = createWebApi();

// Loaded after window.hiremate exists.
const { default: App } = await import("@renderer/App");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthGate>
      <HashRouter>
        <App />
      </HashRouter>
    </AuthGate>
  </StrictMode>,
);
