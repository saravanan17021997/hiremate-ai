// Provider-independent AI interface. Each provider (OpenAI, Claude, ...) implements this.
import type { ProviderId } from "@shared/types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StreamRequest {
  apiKey: string;
  model: string;
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
  /** Progress before the first words: connected, thinking (reasoning models), retrying (rate limit). */
  onStage?: (stage: "connected" | "thinking" | "retrying") => void;
}

export interface AIProvider {
  id: ProviderId;
  label: string;
  /** Rough format check before any network call. */
  looksLikeKey(key: string): boolean;
  /** Calls the provider with the key; returns the chat models it can use. Throws a readable error if the key fails. */
  listModels(apiKey: string): Promise<string[]>;
  /** Streams a reply; resolves when complete. */
  streamChat(req: StreamRequest): Promise<void>;
}

export class ProviderError extends Error {}
