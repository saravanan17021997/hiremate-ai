// npm run dev:web — the web version on http://localhost:5199 with its /api functions running locally.
import { spawn } from "node:child_process";
import { startApiServer } from "./web-api-server.mjs";

await startApiServer();
const vite = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "--config", "vite.web.config.mts"], { stdio: "inherit", shell: process.platform === "win32" });
vite.on("exit", (code) => process.exit(code ?? 0));
