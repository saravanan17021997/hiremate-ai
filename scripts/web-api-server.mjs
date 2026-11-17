// Runs the web version's /api functions on this PC (what Vercel runs in the cloud).
// Used by "npm run dev:web". Reads settings from .env (GROQ_API_KEY, SUPABASE_URL, ...).
import { createServer } from "node:http";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function startApiServer(port = Number(process.env.API_PORT ?? 3199)) {
  if (existsSync(join(root, ".env"))) process.loadEnvFile(join(root, ".env"));
  const names = readdirSync(join(root, "api")).filter((f) => f.endsWith(".ts")).map((f) => f.slice(0, -3));
  const outdir = join(root, "node_modules", ".hiremate-api");
  await build({
    entryPoints: names.map((n) => join(root, "api", `${n}.ts`)),
    outdir, bundle: true, platform: "node", format: "esm", packages: "external", outExtension: { ".js": ".mjs" }, logLevel: "error",
  });
  const handlers = Object.fromEntries(await Promise.all(names.map(async (n) => [n, (await import(`${pathToFileURL(join(outdir, `${n}.mjs`)).href}?t=${Date.now()}`)).default])));
  const server = createServer((req, res) => {
    const name = new URL(req.url ?? "/", "http://x").pathname.replace(/^\/api\//, "");
    const handler = handlers[name];
    if (!handler) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: "Not found" }));
    }
    void handler(req, res);
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  console.log(`[api] /api/{${names.join(",")}} on http://127.0.0.1:${port}`);
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await startApiServer();
