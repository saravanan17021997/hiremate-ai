// Adapter for every provider that speaks the OpenAI Chat Completions format:
// OpenAI itself, Groq, and Google Gemini's OpenAI-compatible endpoint.
import type { ProviderId } from "@shared/types";
import { PROVIDERS } from "../../shared/providers"; // relative: also used by the web server functions
import type { AIProvider, StreamRequest } from "./types";
import { ProviderError } from "./types";
import { httpErrorMessage, readSseData } from "./sse";

interface CompatOptions {
  id: ProviderId;
  apiBase: string; // up to and including the version, e.g. https://api.openai.com/v1
  keyPattern: RegExp;
  isChatModel: (id: string) => boolean;
  maxTokensField: "max_completion_tokens" | "max_tokens";
  /** For "thinking" models: how much to think, and the extra tokens that thinking needs. Unset = not a reasoning model. */
  reasoning?: (model: string) => { effort: string; headroom: number } | undefined;
  fetchFn?: typeof fetch;
}

// Reasoning models spend tokens thinking before they write, and those count against the limit,
// so they get extra room. Kept modest: free plans count that room against their per-minute budget.

export function createOpenAICompatible(o: CompatOptions): AIProvider {
  const label = PROVIDERS[o.id].label;
  const fetchFn = o.fetchFn ?? fetch;
  const unreachable = () => new ProviderError(`Couldn't reach ${label}. Check your internet connection.`);
  return {
    id: o.id,
    label,
    looksLikeKey: (key) => o.keyPattern.test(key),

    async listModels(apiKey) {
      let res: Response;
      try {
        res = await fetchFn(`${o.apiBase}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
      } catch {
        throw unreachable();
      }
      if (!res.ok) throw new ProviderError(await httpErrorMessage(label, res));
      const body = (await res.json()) as { data?: { id: string }[] };
      const ids = (body.data ?? []).map((m) => m.id.replace(/^models\//, "")); // Gemini prefixes ids with "models/"
      return [...new Set(ids.filter(o.isChatModel))].sort();
    },

    async streamChat({ apiKey, model, system, messages, maxTokens, signal, onDelta, onStage }: StreamRequest) {
      const send = async () => {
        try {
          return await fetchFn(`${o.apiBase}/chat/completions`, {
            method: "POST",
            signal,
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(compatBody(o, model, system, messages, maxTokens)),
          });
        } catch (e) {
          if ((e as Error).name === "AbortError") throw e;
          throw unreachable();
        }
      };
      let res = await send();
      if (res.status === 429) {
        // Free-plan per-minute limit: if the provider says the wait is short, wait once and try again.
        const wait = await retryWaitMs(res.clone());
        if (wait !== null && wait <= 12_000) {
          console.warn(`[ai] ${label} rate limit: retrying in ${Math.ceil(wait / 1000)} s`);
          onStage?.("retrying");
          await abortableSleep(wait + 250, signal);
          res = await send();
        }
      }
      if (!res.ok || !res.body) throw new ProviderError(await httpErrorMessage(label, res));
      onStage?.("connected");
      let wrote = false;
      let thinkingSent = 0;
      let cutOff = false;
      for await (const data of readSseData(res.body)) {
        if (data === "[DONE]") break;
        const chunk = JSON.parse(data);
        if (chunk.error) throw new ProviderError(`${label}: ${chunk.error.message ?? "stream error"}`);
        const delta = chunk.choices?.[0]?.delta ?? {};
        // Reasoning models send their thinking separately: not shown, but it proves the model is working.
        if (!wrote && (delta.reasoning || delta.reasoning_content) && Date.now() - thinkingSent > 1000) {
          thinkingSent = Date.now();
          onStage?.("thinking");
        }
        const text = delta.content;
        if (typeof text === "string" && text) {
          wrote = true;
          onDelta(text);
        }
        if (chunk.choices?.[0]?.finish_reason === "length") cutOff = true;
      }
      if (!wrote) {
        throw new ProviderError(
          cutOff
            ? `${label} used its whole budget thinking and wrote no answer. Press Regenerate, choose Medium, or pick a non-reasoning model in Settings.`
            : `${label} returned an empty answer. Press Regenerate.`,
        );
      }
    },
  };
}

/** How long the provider asks us to wait (Retry-After header, or "try again in 7.5s" in the message). */
async function retryWaitMs(res: Response): Promise<number | null> {
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return header * 1000;
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    const m = body?.error?.message?.match(/try again in\s+(?:(\d+)m)?([\d.]+)(ms|s)/i);
    if (m) return (Number(m[1] ?? 0) * 60 + Number(m[2]) / (m[3] === "ms" ? 1000 : 1)) * 1000;
  } catch {
    /* not JSON */
  }
  return null;
}

function abortableSleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    }, { once: true });
  });
}

function compatBody(o: CompatOptions, model: string, system: string, messages: StreamRequest["messages"], maxTokens: number) {
  const r = o.reasoning?.(model);
  return {
    model,
    stream: true,
    [o.maxTokensField]: maxTokens + (r?.headroom ?? 0),
    ...(r ? { reasoning_effort: r.effort } : {}),
    messages: [{ role: "system", content: system }, ...messages],
  };
}

const NOT_CHAT = /(embedding|whisper|tts|audio|realtime|transcribe|image|imagen|dall-e|moderation|search|instruct|veo|lyria|guard|aqa|live|orpheus|playai)/i;

export const createOpenAI = (base = "https://api.openai.com", fetchFn?: typeof fetch) =>
  createOpenAICompatible({
    id: "openai", apiBase: `${base}/v1`, fetchFn, maxTokensField: "max_completion_tokens",
    keyPattern: /^sk-[A-Za-z0-9_\-]{20,}$/,
    isChatModel: (id) => /^(gpt-|o\d|chatgpt-)/i.test(id) && !NOT_CHAT.test(id),
    reasoning: (m) => (/^(o\d|gpt-5)/i.test(m) ? { effort: "low", headroom: 1200 } : undefined),
  });

export const createGroq = (base = "https://api.groq.com/openai", fetchFn?: typeof fetch) =>
  createOpenAICompatible({
    id: "groq", apiBase: `${base}/v1`, fetchFn, maxTokensField: "max_tokens",
    keyPattern: /^gsk_[A-Za-z0-9]{20,}$/,
    isChatModel: (id) => !NOT_CHAT.test(id),
    reasoning: (m) => (/gpt-oss/i.test(m) ? { effort: "low", headroom: 500 } : /qwen3/i.test(m) ? { effort: "none", headroom: 0 } : undefined),
  });

export const createGemini = (base = "https://generativelanguage.googleapis.com/v1beta/openai", fetchFn?: typeof fetch) =>
  createOpenAICompatible({
    id: "gemini", apiBase: base, fetchFn, maxTokensField: "max_tokens",
    keyPattern: /^AIza[A-Za-z0-9_\-]{30,}$/,
    isChatModel: (id) => /^(gemini|gemma)/i.test(id) && !NOT_CHAT.test(id),
    // Gemini 2.5+ thinks by default. Flash models can switch it off; others think a little.
    reasoning: (m) =>
      /^gemini-2\.5-flash/i.test(m) ? { effort: "none", headroom: 0 }
      : /^gemini-(2\.5|[3-9])|^gemini-(flash|pro)-latest/i.test(m) ? { effort: "low", headroom: 1200 }
      : undefined,
  });
