// Main process: creates the window, applies security settings and registers IPC handlers.
import { app, BrowserWindow, safeStorage } from "electron";
import { join } from "node:path";
import { LocalStore } from "./data/localStore";
import { SecretStore } from "./secrets/secretStore";
import { AiService } from "./ai/service";
import { createGemini, createGroq, createOpenAI } from "./ai/openai";
import { createAnthropic } from "./ai/anthropic";
import { validateCloudConfig } from "./cloud/config";
import { AccountService } from "./cloud/account";
import { ProfileService } from "./resume/profileService";
import { ProjectService } from "./projects/projectService";
import { SessionService } from "./interview/sessionService";
import { JobDescriptionService } from "./jd/jobDescriptionService";
import { registerIpcHandlers } from "./ipc/handlers";
import { applySessionSecurity, hardenWebContents } from "./security";

// One copy of the app at a time.
if (!app.requestSingleInstanceLock()) app.quit();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: "HireMate AI",
    backgroundColor: "#070b16",
    autoHideMenuBar: true,
    // Windows: dark custom title bar that keeps the native minimise/maximise/close buttons.
    ...(process.platform === "win32"
      ? { titleBarStyle: "hidden" as const, titleBarOverlay: { color: "#070b16", symbolColor: "#c7d2fe", height: 36 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true, // the page can't touch Electron or Node directly
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  hardenWebContents(mainWindow.webContents);
  mainWindow.once("ready-to-show", () => mainWindow?.show());

  loadApp(mainWindow);
}

/** Loads the UI into a window; `hash` opens a specific page (e.g. "/panel"). */
export function loadApp(win: BrowserWindow, hash = "/") {
  if (!app.isPackaged && process.env["ELECTRON_RENDERER_URL"]) void win.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}#${hash}`);
  else void win.loadFile(join(__dirname, "../renderer/index.html"), { hash });
}

/** Same security settings as the main window. */
export const secureWebPreferences = () => ({
  preload: join(__dirname, "../preload/index.js"),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  spellcheck: false,
  // Lets the live-audio analyser run without a fresh click (the app plays no sound itself).
  autoplayPolicy: "no-user-gesture-required" as const,
});

app.on("second-instance", () => {
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.focus();
});

// Linux only: let "Computer sound" capture PulseAudio/PipeWire output (Windows loopback needs nothing extra).
if (process.platform === "linux") app.commandLine.appendSwitch("enable-features", "PulseaudioLoopbackForScreenShare");

app.whenReady().then(() => {
  app.setAppUserModelId("com.saravanan.hiremate");
  applySessionSecurity();
  // Automated tests on Linux build servers only (no keyring there). Never active in the installed app.
  if (!app.isPackaged && process.platform === "linux" && process.env["HIREMATE_E2E"] === "1") {
    safeStorage.setUsePlainTextEncryption(true);
  }
  const dataFolder = app.getPath("userData");
  const store = LocalStore.inFolder(dataFolder);
  const secrets = SecretStore.inFolder(dataFolder, {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (data) => safeStorage.decryptString(data),
  });
  // Development only: point providers at a local test server. Ignored in the installed app.
  const devUrl = (name: string) => (app.isPackaged ? undefined : process.env[name]);
  const ai = new AiService(store, secrets, [
    createGemini(devUrl("HIREMATE_GEMINI_BASE_URL")),
    createGroq(devUrl("HIREMATE_GROQ_BASE_URL")),
    createOpenAI(devUrl("HIREMATE_OPENAI_BASE_URL")),
    createAnthropic(devUrl("HIREMATE_ANTHROPIC_BASE_URL")),
  ]);
  const cloud = validateCloudConfig(import.meta.env.MAIN_VITE_SUPABASE_URL, import.meta.env.MAIN_VITE_SUPABASE_ANON_KEY);
  if (cloud.problem) console.warn(`[cloud] Sync is off: ${cloud.problem}`);
  const account = new AccountService(cloud.config, secrets, cloud.problem);
  registerIpcHandlers(store, ai, account, new ProfileService(store, account), new ProjectService(store, account), new SessionService(store, account),
    new JobDescriptionService(store, account), { load: loadApp, webPreferences: secureWebPreferences });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
