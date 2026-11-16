import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createOpenAI } from "./openai";
import { createAnthropic } from "./anthropic";
import { AiService, pickModel } from "./service";
import { LocalStore } from "../data/localStore";
import { SecretStore, type Cipher } from "../secrets/secretStore";

// ---- helpers ----
const sse = (lines: string[], splitEvery = 7) => {
  const text = lines.map((l) => `data: ${l}\n\n`).join("");
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < text.length; i += splitEvery) c.enqueue(enc.encode(text.slice(i, i + splitEvery))); // split mid-line on purpose
      c.close();
    },
  });
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fakeCipher = (available = true): Cipher => ({
  isAvailable: () => available,
  encrypt: (p) => Buffer.from(`enc:${Buffer.from(p).toString("base64")}`),
  decrypt: (d) => Buffer.from(d.toString().replace(/^enc:/, ""), "base64").toString(),
});
const folder = () => mkdtempSync(join(tmpdir(), "hiremate-ai-"));
const OPENAI_KEY = "sk-test_abcdefghijklmnopqrstuvwxyz1234";

describe("SecretStore", () => {
  it("stores keys encrypted, never as plain text", () => {
    const dir = folder();
    const s = SecretStore.inFolder(dir, fakeCipher());
    s.set("k", "sk-secret-value");
    expect(s.get("k")).toBe("sk-secret-value");
    expect(readFileSync(join(dir, "secrets.bin.json"), "utf8")).not.toContain("sk-secret-value");
  });
  it("refuses to save when Windows encryption is unavailable", () => {
    expect(() => SecretStore.inFolder(folder(), fakeCipher(false)).set("k", "v")).toThrow(/can't encrypt/);
  });
  it("treats an undecryptable value as missing", () => {
    const dir = folder();
    SecretStore.inFolder(dir, fakeCipher()).set("k", "v");
    const broken = SecretStore.inFolder(dir, { ...fakeCipher(), decrypt: () => { throw new Error("wrong user"); } });
    expect(broken.get("k")).toBeNull();
  });
});

describe("OpenAI adapter", () => {
  it("lists only chat models", async () => {
    const ai = createOpenAI("http://x", async () => json(200, { data: [{ id: "gpt-4o-mini" }, { id: "text-embedding-3-small" }, { id: "whisper-1" }, { id: "o3-mini" }, { id: "gpt-4o-realtime-preview" }] }));
    expect(await ai.listModels(OPENAI_KEY)).toEqual(["gpt-4o-mini", "o3-mini"]);
  });
  it("explains a rejected key", async () => {
    const ai = createOpenAI("http://x", async () => json(401, { error: { message: "Incorrect API key" } }));
    await expect(ai.listModels(OPENAI_KEY)).rejects.toThrow(/rejected the API key/);
  });
  it("streams text pieces even when chunks split lines", async () => {
    let sent: { url?: string; body?: Record<string, unknown>; auth?: string } = {};
    const ai = createOpenAI("http://x", async (url, init) => {
      sent = { url: String(url), body: JSON.parse(String(init?.body)), auth: (init?.headers as Record<string, string>).Authorization };
      return new Response(sse([JSON.stringify({ choices: [{ delta: { role: "assistant" } }] }), JSON.stringify({ choices: [{ delta: { content: "Hello" } }] }), JSON.stringify({ choices: [{ delta: { content: " there" } }] }), "[DONE]"]));
    });
    let out = "";
    await ai.streamChat({ apiKey: OPENAI_KEY, model: "gpt-4o-mini", system: "S", messages: [{ role: "user", content: "Hi" }], maxTokens: 50, onDelta: (t) => (out += t) });
    expect(out).toBe("Hello there");
    expect(sent.url).toBe("http://x/v1/chat/completions");
    expect(sent.auth).toBe(`Bearer ${OPENAI_KEY}`);
    expect(sent.body).toMatchObject({ model: "gpt-4o-mini", stream: true, max_completion_tokens: 50, messages: [{ role: "system", content: "S" }, { role: "user", content: "Hi" }] });
  });
  it("checks key format", () => {
    const ai = createOpenAI();
    expect(ai.looksLikeKey(OPENAI_KEY)).toBe(true);
    expect(ai.looksLikeKey("hello")).toBe(false);
  });
});

describe("Claude adapter", () => {
  it("streams text deltas and stops at message_stop", async () => {
    const ai = createAnthropic("http://x", async () =>
      new Response(sse([
        JSON.stringify({ type: "message_start", message: {} }),
        JSON.stringify({ type: "ping" }),
        JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi " } }),
        JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Saravanan" } }),
        JSON.stringify({ type: "message_stop" }),
      ])),
    );
    let out = "";
    await ai.streamChat({ apiKey: "sk-ant-x", model: "claude-sonnet-4-6", system: "S", messages: [{ role: "user", content: "Hi" }], maxTokens: 50, onDelta: (t) => (out += t) });
    expect(out).toBe("Hi Saravanan");
  });
  it("surfaces an error event", async () => {
    const ai = createAnthropic("http://x", async () => new Response(sse([JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } })])));
    await expect(ai.streamChat({ apiKey: "k", model: "m", system: "", messages: [], maxTokens: 1, onDelta: () => {} })).rejects.toThrow(/Overloaded/);
  });
});

describe("AiService", () => {
  const make = (models = ["gpt-4.1-mini", "gpt-4o-mini"]) => {
    const dir = folder();
    const store = LocalStore.inFolder(dir);
    const secrets = SecretStore.inFolder(dir, fakeCipher());
    let streamed: { apiKey?: string; model?: string } = {};
    const openai = { ...createOpenAI("http://x", async () => json(200, { data: models.map((id) => ({ id })) })), streamChat: async (r: { apiKey: string; model: string; onDelta: (t: string) => void }) => { streamed = r; r.onDelta("ok"); } };
    const service = new AiService(store, secrets, [openai, createAnthropic("http://y", async () => json(401, {}))]);
    return { service, store, secrets, streamed: () => streamed };
  };

  it("starts not ready", () => {
    const { service } = make();
    expect(service.isReady()).toBe(false);
    expect(service.getSettings().providers.every((p) => !p.configured)).toBe(true);
  });

  it("rejects a badly formatted key without saving it", async () => {
    const { service, secrets } = make();
    await expect(service.saveKey("openai", "not-a-key")).rejects.toThrow(/doesn't look like/);
    expect(secrets.has("ai.openai.apiKey")).toBe(false);
  });

  it("does not save a key the provider rejects", async () => {
    const { service, secrets } = make();
    await expect(service.saveKey("anthropic", "sk-ant-abcdefghijklmnopqrstuvwxyz")).rejects.toThrow(/rejected/);
    expect(secrets.has("ai.anthropic.apiKey")).toBe(false);
  });

  it("saves a working key, picks a model, and becomes ready", async () => {
    const { service } = make();
    const s = await service.saveKey("openai", `  ${OPENAI_KEY}  `);
    expect(s.activeProvider).toBe("openai");
    expect(s.activeModel).toBe("gpt-4.1-mini");
    expect(s.providers.find((p) => p.id === "openai")).toMatchObject({ configured: true, keyHint: "…1234" });
    expect(JSON.stringify(s)).not.toContain(OPENAI_KEY); // the UI never gets the key
    expect(service.isReady()).toBe(true);
  });

  it("only allows models the key can use", async () => {
    const { service } = make();
    await service.saveKey("openai", OPENAI_KEY);
    expect(() => service.setActive("openai", "gpt-unknown")).toThrow(/isn't available/);
    expect(service.setActive("openai", "gpt-4o-mini").activeModel).toBe("gpt-4o-mini");
  });

  it("streams with the decrypted key and active model", async () => {
    const t = make();
    await t.service.saveKey("openai", OPENAI_KEY);
    let out = "";
    await t.service.stream({ system: "", messages: [], maxTokens: 10, onDelta: (x) => (out += x) });
    expect(out).toBe("ok");
    expect(t.streamed()).toMatchObject({ apiKey: OPENAI_KEY, model: "gpt-4.1-mini" });
  });

  it("removing the key clears the active provider", async () => {
    const { service } = make();
    await service.saveKey("openai", OPENAI_KEY);
    const s = service.removeKey("openai");
    expect(s.activeProvider).toBeNull();
    expect(service.isReady()).toBe(false);
  });

  it("pickModel keeps the current choice when still available", () => {
    expect(pickModel("openai", ["a", "gpt-4o-mini"], "a")).toBe("a");
    expect(pickModel("openai", ["a", "gpt-4o-mini"], "gone")).toBe("gpt-4o-mini");
    expect(pickModel("anthropic", ["claude-x"], null)).toBe("claude-x");
  });
});

describe("Gemini and Groq (OpenAI-compatible)", () => {
  it("Gemini: strips 'models/' and keeps only chat models", async () => {
    const { createGemini } = await import("./openai");
    const ai = createGemini("http://g", async () => json(200, { data: [{ id: "models/gemini-2.5-flash" }, { id: "models/text-embedding-004" }, { id: "models/imagen-3.0" }, { id: "models/gemma-3-27b-it" }] }));
    expect(await ai.listModels("AIzaSyA1234567890abcdefghijklmnopqrstu")).toEqual(["gemini-2.5-flash", "gemma-3-27b-it"]);
  });
  it("Gemini: a 400 'API key not valid' counts as a rejected key", async () => {
    const { createGemini } = await import("./openai");
    const ai = createGemini("http://g", async () => json(400, [{ error: { code: 400, message: "API key not valid. Please pass a valid API key." } }]));
    await expect(ai.listModels("AIzaSyA1234567890abcdefghijklmnopqrstu")).rejects.toThrow(/rejected the API key/);
  });
  it("Groq: calls its own URL with max_tokens and streams", async () => {
    const { createGroq } = await import("./openai");
    let url = ""; let body: Record<string, unknown> = {};
    const ai = createGroq("http://q", async (u, init) => {
      url = String(u); body = JSON.parse(String(init?.body));
      return new Response(sse([JSON.stringify({ choices: [{ delta: { content: "Fast" } }] }), "[DONE]"]));
    });
    let out = "";
    await ai.streamChat({ apiKey: "gsk_abcdefghijklmnopqrstuvwxyz", model: "openai/gpt-oss-120b", system: "S", messages: [], maxTokens: 99, onDelta: (t) => (out += t) });
    expect(out).toBe("Fast");
    expect(url).toBe("http://q/v1/chat/completions");
    // gpt-oss is a reasoning model: it is asked to think briefly and gets extra room for that thinking.
    expect(body).toMatchObject({ max_tokens: 99 + 500, model: "openai/gpt-oss-120b", reasoning_effort: "low" });
    expect(ai.looksLikeKey("gsk_abcdefghijklmnopqrstuvwxyz")).toBe(true);
    expect(ai.looksLikeKey("sk-abc")).toBe(false);
  });
  it("non-reasoning models get the plain limit and no reasoning setting", async () => {
    const { createGroq } = await import("./openai");
    let body: Record<string, unknown> = {};
    const ai = createGroq("http://q", async (_u, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(sse([JSON.stringify({ choices: [{ delta: { content: "Hi" } }] }), "[DONE]"]));
    });
    await ai.streamChat({ apiKey: "gsk_abcdefghijklmnopqrstuvwxyz", model: "llama-3.3-70b-versatile", system: "S", messages: [], maxTokens: 99, onDelta: () => undefined });
    expect(body.max_tokens).toBe(99);
    expect(body).not.toHaveProperty("reasoning_effort");
  });
  it("Gemini Flash switches thinking off; Pro thinks a little", async () => {
    const { createGemini } = await import("./openai");
    const bodies: Record<string, unknown>[] = [];
    const ai = createGemini("http://g", async (_u, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(sse([JSON.stringify({ choices: [{ delta: { content: "Hi" } }] }), "[DONE]"]));
    });
    for (const model of ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"]) {
      await ai.streamChat({ apiKey: "AIzaSyA1234567890abcdefghijklmnopqrstu", model, system: "S", messages: [], maxTokens: 50, onDelta: () => undefined });
    }
    expect(bodies.map((b) => b.reasoning_effort)).toEqual(["none", "low", undefined]);
  });
  it("waits and retries once when the free-plan limit asks for a short wait", async () => {
    const { createGroq } = await import("./openai");
    let calls = 0;
    const ai = createGroq("http://q", async () => {
      calls += 1;
      if (calls === 1) return new Response(JSON.stringify({ error: { message: "Rate limit reached for model. Please try again in 120ms." } }), { status: 429 });
      return new Response(sse([JSON.stringify({ choices: [{ delta: { content: "OK" } }] }), "[DONE]"]));
    });
    let out = "";
    await ai.streamChat({ apiKey: "gsk_abcdefghijklmnopqrstuvwxyz", model: "llama-3.3-70b-versatile", system: "S", messages: [], maxTokens: 9, onDelta: (t) => (out += t) });
    expect([calls, out]).toEqual([2, "OK"]);
  });
  it("hides voice models from the model list", async () => {
    const { createGroq } = await import("./openai");
    const ai = createGroq("http://q", async () => new Response(JSON.stringify({ data: [{ id: "openai/gpt-oss-20b" }, { id: "canopylabs/orpheus-v1-english" }, { id: "whisper-large-v3" }] })));
    expect(await ai.listModels("gsk_abcdefghijklmnopqrstuvwxyz")).toEqual(["openai/gpt-oss-20b"]);
  });
  it("says so when a reasoning model thinks until the limit and writes nothing", async () => {
    const { createGroq } = await import("./openai");
    const ai = createGroq("http://q", async () =>
      new Response(sse([JSON.stringify({ choices: [{ delta: { reasoning: "hmm…" } }] }), JSON.stringify({ choices: [{ delta: {}, finish_reason: "length" }] }), "[DONE]"])),
    );
    await expect(
      ai.streamChat({ apiKey: "gsk_abcdefghijklmnopqrstuvwxyz", model: "openai/gpt-oss-120b", system: "S", messages: [], maxTokens: 10, onDelta: () => undefined }),
    ).rejects.toThrow(/wrote no answer/);
  });
});
