// Web version build (Vercel): the same React screens as the desktop app, served as a website.
// npm run build:web  →  dist-web/
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8")) as { version: string };

// Strict Content Security Policy: scripts only from this site; network only to this site and your Supabase project.
function contentSecurityPolicy(supabaseUrl: string): Plugin {
  let dev = false;
  return {
    name: "hiremate-web-csp",
    configResolved(c) {
      dev = c.command === "serve";
    },
    transformIndexHtml(html) {
      const supabase = supabaseUrl ? `${supabaseUrl} ${supabaseUrl.replace(/^https:/, "wss:")}` : "";
      const csp = [
        "default-src 'self'",
        dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        `connect-src 'self' ${supabase}${dev ? " ws://localhost:* http://localhost:*" : ""}`.trim(),
        "media-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'none'", // framing is blocked by the X-Frame-Options header in vercel.json
      ].join("; ");
      return html.replace("__HIREMATE_CSP__", csp);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "VITE_");
  return {
    root: resolve(__dirname, "src/web"),
    envDir: __dirname,
    publicDir: resolve(__dirname, "src/web/public"),
    resolve: { alias: { "@renderer": resolve(__dirname, "src/renderer/src"), "@shared": resolve(__dirname, "src/shared") } },
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    plugins: [react(), tailwindcss(), contentSecurityPolicy((env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, ""))],
    build: { outDir: resolve(__dirname, "dist-web"), emptyOutDir: true, target: "es2022", chunkSizeWarningLimit: 1500 },
    server: { port: 5199, proxy: { "/api": "http://127.0.0.1:3199" } },
  };
});
