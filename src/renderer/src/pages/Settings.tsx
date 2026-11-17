// Settings (Phase 2A): AI provider keys, model choice and a live streaming test.
// Keys are sent once to the main process, tested with the provider, and saved encrypted.
// This page never receives a key back: only "connected" and the last 4 characters.

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, CircleDashed, ExternalLink, Info, KeyRound, Loader2, MicOff, Play, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AiSettings, ProviderId, ProviderStatus } from "@shared/types";
import { PROVIDERS } from "@shared/providers";
import { PageHeader } from "../components/PageHeader";
import { AccountCard } from "../components/AccountCard";
import { useIpc } from "../lib/useIpc";


export function Settings() {
  const getSettings = useCallback(() => window.hiremate.ai.getSettings(), []);
  const { data, error, loading, reload } = useIpc(getSettings);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  useEffect(() => {
    setSettings(data);
  }, [data]);

  return (
    <>
      <PageHeader title="Settings" subtitle="AI provider, account, privacy and microphone." />
      <div className="space-y-5 pb-12">
        <section className="glass rounded-3xl p-7" aria-labelledby="ai-title">
          <h2 id="ai-title" className="text-lg font-semibold text-mist">AI provider</h2>
          {settings?.managed ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.07] px-5 py-4 text-sm">
              <span className="inline-flex items-center gap-1.5 text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Ready</span>
              <span className="text-mist">{settings.managed.label} · {settings.managed.model}</span>
              <span className="w-full text-haze">The AI is set up on the server by the owner of this HireMate. There's nothing to enter here; keys never reach your browser.</span>
            </div>
          ) : (
          <>
          <p className="mt-1 max-w-2xl text-sm text-haze">
            Use your own API key. HireMate checks it with the provider, then stores it encrypted on this PC. Requests go straight from this app
            to the provider. No key yet? Gemini and Groq give free keys without a card.
          </p>

          {error && <Banner tone="error">{error} <button className="underline" onClick={() => void reload()}>Retry</button></Banner>}
          {settings && !settings.encryptionAvailable && (
            <Banner tone="warning">Windows can't encrypt secrets for this account right now, so keys can't be saved.</Banner>
          )}

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {loading && !settings
              ? [0, 1, 2, 3].map((i) => <div key={i} className="h-56 animate-pulse rounded-2xl bg-white/[0.04]" />)
              : settings?.providers.map((p) => (
                  <ProviderCard
                    key={p.id}
                    provider={p}
                    active={settings.activeProvider === p.id}
                    activeModel={settings.activeProvider === p.id ? settings.activeModel : null}
                    disabled={!settings.encryptionAvailable}
                    onChange={setSettings}
                  />
                ))}
          </div>
          </>
          )}
        </section>

        <TryIt ready={Boolean(settings?.managed || (settings?.activeProvider && settings.activeModel))} label={describeActive(settings)} />

        <div className="grid gap-5 lg:grid-cols-2">
          <AccountCard />
          <section className="glass rounded-3xl p-7">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-mist"><MicOff className="h-5 w-5 text-haze" /> Microphone</h2>
            <p className="mt-2 text-sm text-haze">Off. HireMate only listens during a Live Assistant session that you start, after you confirm that everyone has agreed.</p>
            <p className="mt-4 flex items-center gap-2 text-sm text-dim"><CircleDashed className="h-4 w-4" /> Meeting audio is never saved.</p>
          </section>
        </div>
      </div>
    </>
  );
}

function describeActive(s: AiSettings | null) {
  if (s?.managed) return `${s.managed.label} · ${s.managed.model}`;
  if (!s?.activeProvider || !s.activeModel) return null;
  const p = s.providers.find((x) => x.id === s.activeProvider);
  return `${p?.label ?? s.activeProvider} · ${s.activeModel}`;
}

/* ---------- One provider ---------- */

function ProviderCard({
  provider, active, activeModel, disabled, onChange,
}: { provider: ProviderStatus; active: boolean; activeModel: string | null; disabled: boolean; onChange: (s: AiSettings) => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<"save" | "remove" | "model" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState(activeModel ?? provider.models[0] ?? "");
  useEffect(() => {
    setModel(activeModel ?? provider.models[0] ?? "");
  }, [activeModel, provider.models]);

  const run = async (kind: "save" | "remove" | "model", call: () => ReturnType<typeof window.hiremate.ai.getSettings>) => {
    setBusy(kind);
    setError(null);
    const result = await call();
    setBusy(null);
    if (result.ok) {
      onChange(result.data);
      setKey("");
    } else setError(result.error);
  };

  return (
    <div className={`flex flex-col rounded-2xl border p-5 transition-colors ${active ? "border-electric/40 bg-electric/[0.06]" : "border-white/[0.07] bg-white/[0.02]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-mist">{provider.label}</p>
          <p className="mt-0.5 text-sm text-haze">
            {provider.configured ? (
              <span className="inline-flex items-center gap-1.5 text-success"><CheckCircle2 className="h-4 w-4" /> Connected · key {provider.keyHint}</span>
            ) : (
              "Not connected"
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {PROVIDERS[provider.id].free && <span className="rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">Free</span>}
          {active && <span className="rounded-full bg-electric/20 px-2.5 py-1 text-xs font-medium text-electric-soft">In use</span>}
        </div>
      </div>
      <p className="mt-2 text-xs text-dim">{PROVIDERS[provider.id].note}</p>

      {provider.configured ? (
        <div className="mt-5 space-y-3">
          <label className="block text-sm text-haze">
            Model
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-navy-800 px-3 py-2.5 text-sm text-mist"
            >
              {provider.models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null || (active && model === activeModel)}
              onClick={() => void run("model", () => window.hiremate.ai.setActive(provider.id, model))}
              className="inline-flex items-center gap-2 rounded-xl bg-electric px-4 py-2 text-sm font-semibold text-white hover:bg-electric/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy === "model" && <Loader2 className="h-4 w-4 animate-spin" />}
              {active ? (model === activeModel ? "Using this model" : "Use this model") : "Use this provider"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void run("remove", () => window.hiremate.ai.removeKey(provider.id))}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm text-haze hover:bg-white/[0.05] hover:text-mist disabled:opacity-40"
            >
              {busy === "remove" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Remove key
            </button>
          </div>
        </div>
      ) : (
        <form
          className="mt-5 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (key.trim()) void run("save", () => window.hiremate.ai.saveKey(provider.id, key));
          }}
        >
          <label className="block text-sm text-haze">
            API key
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-white/10 bg-navy-800 px-3 focus-within:border-electric/50">
              <KeyRound className="h-4 w-4 shrink-0 text-dim" />
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={key}
                disabled={disabled || busy !== null}
                onChange={(e) => setKey(e.target.value)}
                placeholder={PROVIDERS[provider.id].keyPlaceholder}
                className="w-full bg-transparent py-2.5 text-sm text-mist outline-none placeholder:text-dim"
              />
            </div>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={disabled || busy !== null || !key.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-electric px-4 py-2 text-sm font-semibold text-white hover:bg-electric/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy === "save" ? "Checking key…" : "Save and test"}
            </button>
            <button
              type="button"
              onClick={() => void window.hiremate.app.openExternal(PROVIDERS[provider.id].keyPage)}
              className="inline-flex items-center gap-1.5 text-sm text-electric-soft underline-offset-4 hover:underline"
            >
              Get a key <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
    </div>
  );
}

/* ---------- Live streaming test ---------- */

function TryIt({ ready, label }: { ready: boolean; label: string | null }) {
  const [prompt, setPrompt] = useState("In two sentences, what makes a strong answer to 'Tell me about yourself'?");
  const [output, setOutput] = useState("");
  const [state, setState] = useState<"idle" | "streaming" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<string | null>(null);

  // Receive streamed pieces for our request only.
  useEffect(
    () =>
      window.hiremate.ai.onStream((e) => {
        if (e.requestId !== requestRef.current || e.type === "status") return;
        if (e.type === "delta") setOutput((o) => o + e.text);
        else if (e.type === "done") setState("done");
        else {
          setError(e.error);
          setState("error");
        }
      }),
    [],
  );

  const start = async () => {
    setOutput("");
    setError(null);
    setState("streaming");
    const result = await window.hiremate.ai.startTest(prompt);
    if (result.ok) requestRef.current = result.data.requestId;
    else {
      setError(result.error);
      setState("error");
    }
  };

  const stop = () => {
    if (requestRef.current) void window.hiremate.ai.cancel(requestRef.current);
  };

  return (
    <section className="glass rounded-3xl p-7" aria-labelledby="try-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="try-title" className="text-lg font-semibold text-mist">Test the connection</h2>
        {label && <span className="text-sm text-dim">{label}</span>}
      </div>
      {!ready ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-haze"><Info className="h-4 w-4" /> Connect a provider above to send a test question.</p>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-3 md:flex-row">
            <input
              value={prompt}
              maxLength={500}
              onChange={(e) => setPrompt(e.target.value)}
              className="flex-1 rounded-xl border border-white/10 bg-navy-800 px-4 py-2.5 text-sm text-mist outline-none focus:border-electric/50"
            />
            {state === "streaming" ? (
              <button type="button" onClick={stop} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/[0.08] px-5 py-2.5 text-sm font-semibold text-mist hover:bg-white/[0.12]">
                <Square className="h-4 w-4" /> Stop
              </button>
            ) : (
              <button
                type="button"
                disabled={!prompt.trim()}
                onClick={() => void start()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-electric to-violet px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                <Play className="h-4 w-4" /> Send
              </button>
            )}
          </div>
          <AnimatePresence>
            {(output || state === "streaming" || error) && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 min-h-16 rounded-2xl border border-white/[0.06] bg-navy-950/60 p-4" data-selectable>
                {error ? (
                  <p role="alert" className="text-sm text-rose-300">{error}</p>
                ) : (
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-mist" aria-live="polite">
                    {output}
                    {state === "streaming" && <span className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-electric-soft" />}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </section>
  );
}

function Banner({ tone, children }: { tone: "error" | "warning"; children: React.ReactNode }) {
  return (
    <div role="alert" className={`mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${tone === "error" ? "border-rose-500/30 bg-rose-500/10 text-rose-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200"}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
