// Web floating panel: a small always-on-top window using Chrome/Edge "Document Picture-in-Picture".
// It shows the same FloatingPanel as the desktop app and talks to the page through a tiny event bus.
import { createRoot, type Root } from "react-dom/client";
import type { PanelAction, PanelState } from "@shared/types";
import { FloatingPanel } from "@renderer/pages/FloatingPanel";

type PipApi = { requestWindow(o: { width: number; height: number }): Promise<Window>; window: Window | null };

let pipWindow: Window | null = null;
let root: Root | null = null;
let lastState: PanelState | null = null;
const stateListeners = new Set<(s: PanelState) => void>();
const actionListeners = new Set<(a: PanelAction) => void>();

export const panelBus = {
  publish(state: PanelState) {
    lastState = state;
    stateListeners.forEach((l) => l(state));
  },
  getState: () => lastState,
  onState(l: (s: PanelState) => void) {
    stateListeners.add(l);
    return () => void stateListeners.delete(l);
  },
  act(a: PanelAction) {
    actionListeners.forEach((l) => l(a));
  },
  onAction(l: (a: PanelAction) => void) {
    actionListeners.add(l);
    return () => void actionListeners.delete(l);
  },
};

/** Must run straight from a click. */
export async function openPanel(): Promise<void> {
  const api = (window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture;
  if (!api) throw new Error("The floating panel needs Chrome or Microsoft Edge (version 116 or newer).");
  if (pipWindow && !pipWindow.closed) return pipWindow.focus();
  const win = await api.requestWindow({ width: 400, height: 560 });
  pipWindow = win;
  // Same styles as the page.
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = win.document.createElement("style");
      style.textContent = Array.from(sheet.cssRules).map((r) => r.cssText).join("\n");
      win.document.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = win.document.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        win.document.head.appendChild(link);
      }
    }
  }
  win.document.title = "HireMate AI – Assistant panel";
  win.document.documentElement.className = document.documentElement.className;
  win.document.body.className = document.body.className;
  win.document.body.style.margin = "0";
  win.document.body.style.height = "100vh";
  const host = win.document.createElement("div");
  host.style.height = "100%";
  win.document.body.appendChild(host);
  root = createRoot(host);
  root.render(<FloatingPanel />);
  win.addEventListener("pagehide", () => {
    root?.unmount();
    root = null;
    pipWindow = null;
  });
}

export function closePanel() {
  pipWindow?.close();
  pipWindow = null;
}
