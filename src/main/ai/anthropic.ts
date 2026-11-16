// Claude (Anthropic) adapter: Messages API with streaming.
import type { AIProvider, StreamRequest } from "./types";
import { ProviderError } from "./types";
import { httpErrorMessage, readSseData } from "./sse";

const VERSION = "2023-06-01";

export function createAnthropic(baseUrl = "https://api.anthropic.com", fetchFn: typeof fetch = fetch): AIProvider {
  return {
    id: "anthropic",
    label: "Claude (Anthropic)",
    looksLikeKey: (key) => /^sk-ant-[A-Za-z0-9_\-]{20,}$/.test(key),

    async listModels(apiKey) {
      let res: Response;
      try {
        res = await fetchFn(`${baseUrl}/v1/models?limit=100`, { headers: { "x-api-key": apiKey, "anthropic-version": VERSION } });
      } catch {
        throw new ProviderError("Couldn't reach Anthropic. Check your internet connection.");
      }
      if (!res.ok) throw new ProviderError(await httpErrorMessage("Anthropic", res));
      const body = (await res.json()) as { data?: { id: string }[] };
      return (body.data ?? []).map((m) => m.id).filter((id) => id.startsWith("claude")).sort();
    },

    async streamChat({ apiKey, model, system, messages, maxTokens, signal, onDelta, onStage }: StreamRequest) {
      let res: Response;
      try {
        res = await fetchFn(`${baseUrl}/v1/messages`, {
          method: "POST",
          signal,
          headers: { "x-api-key": apiKey, "anthropic-version": VERSION, "content-type": "application/json" },
          body: JSON.stringify({ model, system, messages, max_tokens: maxTokens, stream: true }),
        });
      } catch (e) {
        if ((e as Error).name === "AbortError") throw e;
        throw new ProviderError("Couldn't reach Anthropic. Check your internet connection.");
      }
      if (!res.ok || !res.body) throw new ProviderError(await httpErrorMessage("Anthropic", res));
      onStage?.("connected");
      for await (const data of readSseData(res.body)) {
        const event = JSON.parse(data);
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") onDelta(event.delta.text);
        else if (event.type === "error") throw new ProviderError(`Anthropic: ${event.error?.message ?? "stream error"}`);
        else if (event.type === "message_stop") return;
      }
    },
  };
}
