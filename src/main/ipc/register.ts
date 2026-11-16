// One safe way to add an IPC handler:
// 1. only our own app window may call it (checked by the page URL),
// 2. the input must match a zod schema,
// 3. errors come back as { ok: false, error } instead of crashing the UI.

import { ipcMain, type IpcMainInvokeEvent } from "electron";
import type { ZodType } from "zod";
import type { IpcChannel, IpcResult } from "@shared/ipc";
import { isTrustedUrl } from "../security";

export function handle<I, O>(channel: IpcChannel, input: ZodType<I>, fn: (data: I, event: IpcMainInvokeEvent) => Promise<O> | O) {
  ipcMain.handle(channel, async (event, raw): Promise<IpcResult<O>> => {
    const url = event.senderFrame?.url ?? "";
    if (!isTrustedUrl(url)) {
      console.warn(`[ipc] Blocked ${channel} from untrusted page: ${url}`);
      return { ok: false, error: "Request blocked." };
    }
    const parsed = input.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `Invalid request: ${parsed.error.issues[0]?.message ?? "bad input"}` };
    try {
      return { ok: true, data: await fn(parsed.data, event) };
    } catch (e) {
      console.error(`[ipc] ${channel} failed`, e);
      return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
    }
  });
}
