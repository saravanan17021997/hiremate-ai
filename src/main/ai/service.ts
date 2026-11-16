// Chooses the active AI provider, keeps keys encrypted, and runs streamed requests.
// Everything here runs in the main process only.

import type { AiSettings, ProviderId } from "@shared/types";
import { PROVIDERS } from "@shared/providers";
import type { LocalStore } from "../data/localStore";
import type { SecretStore } from "../secrets/secretStore";
import type { AIProvider, ChatMessage } from "./types";
import { ProviderError } from "./types";

// Preferred default model per provider, used only if the key's model list contains it.
const PREFERRED: Record<ProviderId, string[]> = {
  gemini: ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"],
  groq: ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b"],
  openai: ["gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini"],
  anthropic: ["claude-sonnet-5-5", "claude-sonnet-4-6", "claude-haiku-5-5"],
};

const secretName = (id: ProviderId) => `ai.${id}.apiKey`;

export class AiService {
  private readonly providers: Map<ProviderId, AIProvider>;

  constructor(private readonly store: LocalStore, private readonly secrets: SecretStore, providers: AIProvider[]) {
    this.providers = new Map(providers.map((p) => [p.id, p]));
  }

  getSettings(): AiSettings {
    const { settings } = this.store.read();
    return {
      providers: [...this.providers.values()].map((p) => {
        const key = this.secrets.get(secretName(p.id));
        return {
          id: p.id,
          label: p.label,
          configured: key !== null,
          keyHint: key ? `…${key.slice(-4)}` : null,
          models: key ? (settings.aiModels[p.id] ?? []) : [],
        };
      }),
      activeProvider: settings.aiProvider,
      activeModel: settings.aiModel,
      encryptionAvailable: this.secrets.encryptionAvailable,
    };
  }

  /** True when an active provider with a saved key and a model is selected. */
  isReady(): boolean {
    const { settings } = this.store.read();
    return Boolean(settings.aiProvider && settings.aiModel && this.secrets.has(secretName(settings.aiProvider)));
  }

  async saveKey(id: ProviderId, rawKey: string): Promise<AiSettings> {
    const provider = this.provider(id);
    const key = rawKey.trim();
    if (!provider.looksLikeKey(key)) {
      throw new ProviderError(`That doesn't look like a ${provider.label} API key. ${PROVIDERS[id].keyHelp}`);
    }
    if (!this.secrets.encryptionAvailable) throw new ProviderError("Windows can't encrypt secrets for this account, so the key can't be saved.");

    const models = await provider.listModels(key); // real call: proves the key works
    if (models.length === 0) throw new ProviderError(`${provider.label} accepted the key, but it has no chat models available.`);

    this.secrets.set(secretName(id), key);
    const data = this.store.read();
    data.settings.aiModels[id] = models;
    if (!data.settings.aiProvider || data.settings.aiProvider === id) {
      data.settings.aiProvider = id;
      data.settings.aiModel = pickModel(id, models, data.settings.aiProvider === id ? data.settings.aiModel : null);
    }
    this.store.write(data);
    return this.getSettings();
  }

  removeKey(id: ProviderId): AiSettings {
    this.provider(id);
    this.secrets.delete(secretName(id));
    const data = this.store.read();
    delete data.settings.aiModels[id];
    if (data.settings.aiProvider === id) {
      // Switch to another provider that still has a key, if any.
      const other = [...this.providers.keys()].find((p) => p !== id && this.secrets.has(secretName(p))) ?? null;
      data.settings.aiProvider = other;
      data.settings.aiModel = other ? pickModel(other, data.settings.aiModels[other] ?? [], null) : null;
    }
    this.store.write(data);
    return this.getSettings();
  }

  setActive(id: ProviderId, model: string): AiSettings {
    const provider = this.provider(id);
    if (!this.secrets.has(secretName(id))) throw new ProviderError(`Save a ${provider.label} key first.`);
    const data = this.store.read();
    if (!(data.settings.aiModels[id] ?? []).includes(model)) throw new ProviderError(`${model} isn't available for this key.`);
    data.settings.aiProvider = id;
    data.settings.aiModel = model;
    this.store.write(data);
    return this.getSettings();
  }

  /** Key for live transcription: Groq (free Whisper) first, then OpenAI. Claude and Gemini can't transcribe here. */
  transcriptionKey(): { provider: "groq" | "openai"; apiKey: string } | null {
    for (const provider of ["groq", "openai"] as const) {
      const apiKey = this.secrets.get(secretName(provider));
      if (apiKey) return { provider, apiKey };
    }
    return null;
  }

  /** Streams a reply from the active provider. */
  async stream(opts: { system: string; messages: ChatMessage[]; maxTokens: number; signal?: AbortSignal; onDelta: (t: string) => void; onStage?: (s: "connected" | "thinking" | "retrying") => void }) {
    const { settings } = this.store.read();
    if (!settings.aiProvider || !settings.aiModel) throw new ProviderError("No AI provider is set up. Add an API key in Settings.");
    const apiKey = this.secrets.get(secretName(settings.aiProvider));
    if (!apiKey) throw new ProviderError("The saved API key can't be read on this PC. Add it again in Settings.");
    await this.provider(settings.aiProvider).streamChat({ ...opts, apiKey, model: settings.aiModel });
  }

  private provider(id: ProviderId): AIProvider {
    const p = this.providers.get(id);
    if (!p) throw new ProviderError(`Unknown AI provider: ${id}`);
    return p;
  }
}

export function pickModel(id: ProviderId, models: string[], current: string | null): string | null {
  if (current && models.includes(current)) return current;
  return PREFERRED[id].find((m) => models.includes(m)) ?? models[0] ?? null;
}
