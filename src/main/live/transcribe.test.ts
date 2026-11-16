import { describe, expect, it } from "vitest";
import { cleanTranscript, scoreTranscript, transcribe } from "./transcribe";

describe("scoreTranscript", () => {
  it("flags mumbled speech as unclear", () => {
    expect(scoreTranscript("what about the uh", [{ avg_logprob: -1.4, no_speech_prob: 0.2 }])).toMatchObject({ unclear: true });
    expect(scoreTranscript("hello", [{ avg_logprob: -0.2, no_speech_prob: 0.9 }]).unclear).toBe(true);
  });
  it("has no score when the model gives none", () => expect(scoreTranscript("hi there friend")).toEqual({ text: "hi there friend", confidence: null, unclear: false }));
});

describe("transcribe", () => {
  it("sends the audio to Groq Whisper and returns the text", async () => {
    let url = ""; let form: FormData | null = null; let auth = "";
    const text = await transcribe("groq", "gsk_key", new Uint8Array([1, 2, 3]), "audio/webm;codecs=opus", {
      baseUrl: "http://x",
      fetchFn: async (u, init) => {
        url = String(u); form = init?.body as FormData; auth = (init?.headers as Record<string, string>).Authorization;
        return new Response(JSON.stringify({ text: "  Tell me about   yourself? ", segments: [{ avg_logprob: -0.1, no_speech_prob: 0.01 }] }), { status: 200 });
      },
    });
    expect(text).toEqual({ text: "Tell me about yourself?", confidence: 0.9, unclear: false });
    expect(form!.get("response_format")).toBe("verbose_json");
    expect(url).toBe("http://x/audio/transcriptions");
    expect(auth).toBe("Bearer gsk_key");
    expect(form!.get("model")).toBe("whisper-large-v3-turbo");
    expect((form!.get("file") as File).name).toBe("segment.webm");
  });
  it("explains a rejected key", async () => {
    await expect(transcribe("openai", "k", new Uint8Array([1]), "audio/webm", { fetchFn: async () => new Response("{}", { status: 401 }) })).rejects.toThrow(/rejected the API key/);
  });
  it("drops Whisper's phantom phrases from silence", () => {
    expect(cleanTranscript("Thank you.")).toBe("");
    expect(cleanTranscript("[Music]")).toBe("");
    expect(cleanTranscript("Thank you for joining, tell me about yourself")).toBe("Thank you for joining, tell me about yourself");
  });
});
