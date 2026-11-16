// The complete list of messages the UI may send to the main process.
// Every channel has a zod schema for its input in the main process; anything else is rejected.
// Keep this file free of Node/Electron imports so the preload and renderer can use it too.

export const IPC = {
  appGetInfo: "app:get-info",
  dashboardGetSummary: "dashboard:get-summary",
  shellOpenExternal: "shell:open-external",
  aiGetSettings: "ai:get-settings",
  aiSaveKey: "ai:save-key",
  aiRemoveKey: "ai:remove-key",
  aiSetActive: "ai:set-active",
  aiStartTest: "ai:start-test",
  aiCancel: "ai:cancel",
  accountGetStatus: "account:get-status",
  accountSignUp: "account:sign-up",
  accountSignIn: "account:sign-in",
  accountSignOut: "account:sign-out",
  resumeImport: "resume:import",
  profileGet: "profile:get",
  profileSave: "profile:save",
  projectsList: "projects:list",
  projectsSave: "projects:save",
  projectsDelete: "projects:delete",
  interviewContext: "interview:context",
  interviewAsk: "interview:ask",
  liveStart: "live:start",
  liveStop: "live:stop",
  liveTranscribe: "live:transcribe",
  windowAlwaysOnTop: "window:always-on-top",
  jdImport: "jd:import",
  jdGet: "jd:get",
  jdClear: "jd:clear",
  sessionsList: "sessions:list",
  sessionsDelete: "sessions:delete",
  panelOpen: "panel:open",
  panelClose: "panel:close",
  panelPublish: "panel:publish",
  panelGetState: "panel:get-state",
  panelAction: "panel:action",
} as const;

/** Events the main process pushes to the UI (not requests). */
export const IPC_EVENTS = {
  aiStream: "ai:stream",
  panelState: "panel:state", // main window → floating panel
  panelAction: "panel:action", // floating panel → main window
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/** Standard result wrapper so errors reach the UI as readable messages instead of crashes. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };
