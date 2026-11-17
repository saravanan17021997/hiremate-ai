// The compact floating panel: a small always-on-top window that mirrors the Live Assistant.
// It is a normal visible window (it shows up in screen sharing like any other window).
import { BrowserWindow, screen } from "electron";
import { hardenWebContents } from "./security";
import { APP_NAME } from "../shared/brand";

let panel: BrowserWindow | null = null;

export function openPanel(load: (win: BrowserWindow, hash: string) => void, webPreferences: Electron.WebPreferences) {
  if (panel && !panel.isDestroyed()) {
    panel.show();
    panel.focus();
    return panel;
  }
  const { workArea } = screen.getPrimaryDisplay();
  panel = new BrowserWindow({
    width: 400,
    height: 560,
    x: workArea.x + workArea.width - 420,
    y: workArea.y + 60,
    minWidth: 320,
    minHeight: 360,
    alwaysOnTop: true,
    title: `${APP_NAME} – Assistant panel`,
    backgroundColor: "#070b16",
    autoHideMenuBar: true,
    webPreferences,
  });
  panel.setAlwaysOnTop(true, "floating");
  hardenWebContents(panel.webContents);
  panel.on("closed", () => (panel = null));
  load(panel, "/panel");
  return panel;
}

export function closePanel() {
  if (panel && !panel.isDestroyed()) panel.close();
  panel = null;
}

export const getPanel = () => (panel && !panel.isDestroyed() ? panel : null);
