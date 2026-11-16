// Facts about each AI provider that both the main process and the Settings page need.
import type { ProviderId } from "./types";

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  keyPlaceholder: string;
  keyHelp: string; // shown when the key format is wrong
  keyPage: string; // where to create a key
  free: boolean; // has a free tier without a card
  note: string; // one line shown on the card
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  gemini: {
    id: "gemini", label: "Google Gemini", keyPlaceholder: "AIza...", keyHelp: "Gemini keys from Google AI Studio start with AIza.",
    keyPage: "https://aistudio.google.com/apikey", free: true,
    note: "Free tier, no card. On the free tier Google may use what you send to improve its products.",
  },
  groq: {
    id: "groq", label: "Groq", keyPlaceholder: "gsk_...", keyHelp: "Groq keys start with gsk_.",
    keyPage: "https://console.groq.com/keys", free: true,
    note: "Free tier, no card. Very fast open models; daily limits apply.",
  },
  openai: {
    id: "openai", label: "OpenAI", keyPlaceholder: "sk-...", keyHelp: "OpenAI keys start with sk-.",
    keyPage: "https://platform.openai.com/api-keys", free: false, note: "Paid: needs credit on your OpenAI account.",
  },
  anthropic: {
    id: "anthropic", label: "Claude (Anthropic)", keyPlaceholder: "sk-ant-...", keyHelp: "Claude keys start with sk-ant-.",
    keyPage: "https://console.anthropic.com/settings/keys", free: false, note: "Paid: needs credit on your Anthropic account.",
  },
};

export const PROVIDER_IDS = ["gemini", "groq", "openai", "anthropic"] as const;
