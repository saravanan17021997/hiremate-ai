import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Content Security Policy for the UI. The production build is strict: no inline scripts at all.
// The dev server needs one inline script (React Fast Refresh), so only `npm run dev` allows inline scripts.
const CSP_PROD =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'";
const CSP_DEV =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:*; object-src 'none'; base-uri 'none'";

function contentSecurityPolicy(): Plugin {
  let dev = false;
  return {
    name: "hiremate-csp",
    configResolved(config) {
      dev = config.command === "serve";
    },
    transformIndexHtml(html) {
      return html.replace("__HIREMATE_CSP__", dev ? CSP_DEV : CSP_PROD);
    },
  };
}

// Three builds: main (Node), preload (bridge) and renderer (React UI).
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { "@shared": resolve("src/shared") } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { "@shared": resolve("src/shared") } },
  },
  renderer: {
    resolve: { alias: { "@renderer": resolve("src/renderer/src"), "@shared": resolve("src/shared") } },
    plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  },
});
