// Electron hardening applied to every window. See docs/ARCHITECTURE.md, "Security".
import { app, desktopCapturer, session, shell, type WebContents } from "electron";

const DEV_URL = process.env["ELECTRON_RENDERER_URL"]; // set by electron-vite in development only

/** True only for our own UI: the dev server in development, the packaged file in production. */
export function isTrustedUrl(url: string): boolean {
  if (!url) return false;
  if (!app.isPackaged && DEV_URL && url.startsWith(DEV_URL)) return true;
  return url.startsWith("file://") && url.includes("/out/renderer/");
}

// Content Security Policy: the UI may load only its own files. It makes no network calls itself;
// AI and database calls go through the main process.
const CSP = [
  "default-src 'self'",
  "script-src 'self'" + (DEV_URL && !app.isPackaged ? " 'unsafe-inline'" : ""), // dev server's React Fast Refresh only
  "style-src 'self' 'unsafe-inline'", // inline styles from framer-motion
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'" + (DEV_URL ? " ws://localhost:* http://localhost:*" : ""), // dev server hot reload only
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

let captureAllowed = false;

/** Turned on by live:start (after consent) and off by live:stop. */
export function setCaptureAllowed(on: boolean) {
  captureAllowed = on;
}

export function applySessionSecurity() {
  const ses = session.defaultSession;

  ses.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [CSP] } });
  });

  // Deny every browser permission (camera, mic, location, notifications...) except writing text to the
  // clipboard ("Copy answer"). Audio capture is allowed ONLY while a live session with recorded consent is running.
  const always = new Set(["clipboard-sanitized-write"]);
  const duringLive = new Set(["media", "display-capture"]);
  const allowed = (p: string) => always.has(p) || (captureAllowed && duringLive.has(p));
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => allowed(permission));

  // System-audio capture (what you hear from Teams / Zoom / Meet) via Windows loopback.
  // Refused unless a consented live session is active. Nothing is ever captured in the background.
  ses.setDisplayMediaRequestHandler((_request, callback) => {
    if (!captureAllowed) return callback({});
    desktopCapturer
      .getSources({ types: ["screen"] })
      .then((sources) => (sources[0] ? callback({ video: sources[0], audio: "loopback" }) : callback({})))
      .catch(() => callback({}));
  });
}

export function hardenWebContents(contents: WebContents) {
  // No pop-up windows; open https links in the normal browser instead.
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  // The app window may never navigate away from the app.
  contents.on("will-navigate", (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault();
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
}
