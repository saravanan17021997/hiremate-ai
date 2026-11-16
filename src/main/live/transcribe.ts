// Speech-to-text for live sessions. Uses Whisper on Groq (free key) or OpenAI's transcription model.
import type { Transcript } from "@shared/types";
import { ProviderError } from "../ai/types";
import { httpErrorMessage } from "../ai/sse";

export type TranscriptionProvider = "groq" | "openai";

const CONFIG: Record<TranscriptionProvider, { base: string; model: string; label: string }> = {
  groq: { base: "https://api.groq.com/openai/v1", model: "whisper-large-v3-turbo", label: "Groq" },
  openai: { base: "https://api.openai.com/v1", model: "gpt-4o-mini-transcribe", label: "OpenAI" },
};

// Whisper sometimes "hears" these in silence or music; a segment that is only one of them is dropped.
const PHANTOM = /^(thank you\.?|thanks for watching!?|you|bye\.?|\.+|music|\[.*\]|\(.*\))$/i;

export function cleanTranscript(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return PHANTOM.test(t) ? "" : t;
}

export async function transcribe(
  provider: TranscriptionProvider,
  apiKey: string,
  audio: Uint8Array,
  mime: string,
  opts: { baseUrl?: string; fetchFn?: typeof fetch } = {},
): Promise<Transcript> {
  const cfg = CONFIG[provider];
  const form = new FormData();
  const ext = mime.includes("ogg") ? "ogg" : mime.includes("wav") ? "wav" : "webm";
  form.append("file", new Blob([audio], { type: mime }), `segment.${ext}`);
  form.append("model", cfg.model);
  // Whisper (Groq) returns per-segment scores with verbose_json; OpenAI's newer model only returns text.
  form.append("response_format", provider === "groq" ? "verbose_json" : "json");
  form.append("language", "en");
  let res: Response;
  try {
    res = await (opts.fetchFn ?? fetch)(`${opts.baseUrl ?? cfg.base}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } catch {
    throw new ProviderError(`Couldn't reach ${cfg.label} for transcription. Check your internet connection.`);
  }
  if (!res.ok) throw new ProviderError(await httpErrorMessage(`${cfg.label} transcription`, res));
  const body = (await res.json()) as { text?: string; segments?: { avg_logprob?: number; no_speech_prob?: number }[] };
  return scoreTranscript(cleanTranscript(body.text ?? ""), body.segments);
}

/** Turns Whisper's segment scores into a 0..1 confidence, and flags speech too unclear to trust. */
export function scoreTranscript(text: string, segments?: { avg_logprob?: number; no_speech_prob?: number }[]): Transcript {
  if (!segments?.length) return { text, confidence: null, unclear: false };
  const avg = (k: "avg_logprob" | "no_speech_prob") => segments.reduce((sum, s) => sum + (s[k] ?? 0), 0) / segments.length;
  const confidence = Math.max(0, Math.min(1, Math.exp(avg("avg_logprob"))));
  const unclear = Boolean(text) && (confidence < 0.45 || avg("no_speech_prob") > 0.6);
  return { text, confidence: Math.round(confidence * 100) / 100, unclear };
}
