// Reads a Server-Sent Events body and yields each "data:" payload as a string.
export async function* readSseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        if (line.startsWith("data:")) yield line.slice(5).trim();
      }
    }
    if (buffer.startsWith("data:")) yield buffer.slice(5).trim();
  } finally {
    reader.releaseLock();
  }
}

/** Turns an HTTP error from a provider into a short message for the user. */
export async function httpErrorMessage(provider: string, res: Response): Promise<string> {
  let detail = "";
  try {
    const raw = (await res.json()) as unknown;
    const body = (Array.isArray(raw) ? raw[0] : raw) as { error?: { message?: string } }; // Gemini wraps errors in an array
    detail = body?.error?.message ?? "";
  } catch {
    /* not JSON */
  }
  if (res.status === 401 || /api key (not valid|invalid)|invalid api key/i.test(detail)) return `${provider} rejected the API key. Check it and try again.`;
  if (res.status === 403) return `${provider} says this key doesn't have access${detail ? `: ${detail}` : "."}`;
  if (res.status === 404) return `${provider}: model not found${detail ? ` (${detail})` : ""}.`;
  if (res.status === 413 || /request too large/i.test(detail)) return `${provider}: this request is too big for your plan's per-minute limit. Wait a minute and press Regenerate, or use a smaller job description.`;
  if (res.status === 429) return `${provider}: free-plan limit reached${detail ? ` (${detail})` : ""}. Wait a few seconds and press Regenerate.`;
  if (res.status >= 500) return `${provider} is having problems right now (${res.status}). Try again shortly.`;
  return `${provider} error ${res.status}${detail ? `: ${detail}` : ""}`;
}
