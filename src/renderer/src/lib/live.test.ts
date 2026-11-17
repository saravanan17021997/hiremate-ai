import { describe, expect, it } from "vitest";
import { SpeechSegmenter } from "./segmenter";
import { continuesQuestion, isLikelyQuestion, pendingQuestion } from "./questions";

describe("SpeechSegmenter", () => {
  const run = (levels: number[]) => {
    const s = new SpeechSegmenter({ threshold: 0.02, silenceMs: 500, minSpeechMs: 200, maxSegmentMs: 3000 });
    return levels.map((l, i) => s.feed(l, i * 100)).filter(Boolean);
  };
  it("starts on speech and ends after a pause", () => {
    expect(run([0, 0.1, 0.1, 0.1, 0.1, 0, 0, 0, 0, 0, 0])).toEqual([{ type: "speech-start" }, { type: "segment-end", hadSpeech: true, speechMs: 300 }]);
  });
  it("marks a short click as no speech", () => {
    expect(run([0.1, 0, 0, 0, 0, 0, 0])[1]).toMatchObject({ type: "segment-end", hadSpeech: false });
  });
  it("uses the chosen pause length, and can change it while listening", () => {
    const s = new SpeechSegmenter({ threshold: 0.02, silenceMs: 500, minSpeechMs: 200, maxSegmentMs: 30000 });
    const feed = (levels: number[], from: number) => levels.map((l, i) => s.feed(l, from + i * 100)).filter(Boolean);
    // 0.4 s of quiet is not enough to end the sentence at 0.5 s...
    expect(feed([0.1, 0.1, 0.1, 0, 0, 0, 0, 0.1], 0)).toEqual([{ type: "speech-start" }]);
    // ...but 0.5 s is.
    expect(feed([0, 0, 0, 0, 0, 0], 800).map((e) => e?.type)).toEqual(["segment-end"]);
    s.setSilenceMs(1000);
    expect(feed([0.1, 0.1, 0.1, 0, 0, 0, 0, 0, 0, 0], 2000).map((e) => e?.type)).toEqual(["speech-start"]); // 0.7 s quiet: still listening
  });
  it("cuts very long speech", () => {
    const ev = run(Array(40).fill(0.1));
    expect(ev[1]).toMatchObject({ type: "segment-end", hadSpeech: true });
  });
});

describe("question detection", () => {
  it("recognises questions and requests", () => {
    for (const q of ["Tell me about yourself.", "Walk me through your last project", "How did you test it?", "So what made you choose n8n", "Can you explain row level security", "What happened?", "Why n8n?"]) expect(isLikelyQuestion(q)).toBe(true);
  });
  it("ignores small talk and short fragments", () => {
    for (const q of ["Hi there.", "Okay, great.", "Thanks for joining today.", "Yes?", "Right?", "You know?", "Can you hear me?", "If anything else, we can connect the meeting now."]) expect(isLikelyQuestion(q)).toBe(false);
  });
  it("joins a lead-in spoken just before the question, and nothing older", () => {
    const L = (text: string, startedAt: number, endedAt = startedAt + 1500) => ({ text, startedAt, endedAt });
    expect(pendingQuestion([L("So, about your last role.", 0), L("What did you automate there?", 2000)])).toBe("So, about your last role. What did you automate there?");
    expect(pendingQuestion([L("So, about your last role.", 0)])).toBeNull();
    expect(pendingQuestion([L("Thanks for joining today.", 0), L("So, about your last role.", 3000), L("What did you automate there?", 5000)])).toBe("So, about your last role. What did you automate there?");
    // Too long ago: the new question stands alone.
    expect(pendingQuestion([L("Hello, hello, hello.", 0), L("What are the tools available in n8n?", 9000)])).toBe("What are the tools available in n8n?");
    // A long statement is not a lead-in.
    expect(pendingQuestion([L("We spent the whole of last quarter migrating every single workflow from the old server to the new one", 0), L("How did it go?", 2000)])).toBe("How did it go?");
  });
});

describe("new question or the rest of the last one", () => {
  it("joins the rest of a question that a short pause cut in two", () => {
    expect(continuesQuestion("Can you explain how", "the REST API authentication works?", 400)).toBe(true);
    expect(continuesQuestion("Explain your experience with REST APIs?", "Especially with Business Central.", 400)).toBe(true);
    expect(continuesQuestion("Tell me about your last project", "and what you built in it?", 600)).toBe(true);
  });
  it("treats a complete question after a finished one as a NEW question", () => {
    expect(continuesQuestion("How did you integrate Business Central?", "What is your notice period?", 300)).toBe(false);
    expect(continuesQuestion("Explain your experience with REST APIs?", "How did you integrate Business Central?", 200)).toBe(false);
    expect(continuesQuestion("Tell me about a challenging project.", "Why do you want to leave your current job?", 300)).toBe(false);
  });
  it("still joins a short fragment that Whisper ended with a full stop", () => {
    expect(continuesQuestion("Can you tell me.", "What you did in your last role?", 300)).toBe(true);
  });
  it("never joins speech after the 1 second window", () => {
    expect(continuesQuestion("Can you explain how", "the API works?", 1200)).toBe(false);
  });
});
