import { describe, expect, it, vi } from "vitest";
import type { PhoneFeed } from "@shared/types";
import { acceptFeed, createPublisher, nextSeq, seenRecently } from "./phoneFeed";

const feed = (rev: number, question: string, extra: Partial<PhoneFeed> = {}): PhoneFeed => ({
  active: true, sessionId: "s", rev, seq: 1, request: null, laptopSeenAt: null, viewerSeenAt: null,
  state: { status: "listening", question, answer: `answer for ${question}`, mode: "short", questionType: null, confidence: null, firstWordsMs: null, totalMs: null, disclosure: "", notice: null, audio: "listening", audioNote: null, requestId: question },
  ...extra,
});

describe("question numbers", () => {
  it("counts new questions, keeps the number for a regenerate or the rest of a split question", () => {
    let s = { question: "", seq: 0 };
    s = nextSeq(s, "Explain your experience with REST APIs.");
    expect(s.seq).toBe(1);
    s = nextSeq(s, "Explain your experience with REST APIs."); // regenerate: same text
    expect(s.seq).toBe(1);
    s = nextSeq(s, "Explain your experience with REST APIs. And GraphQL?"); // continuation
    expect(s.seq).toBe(1);
    s = nextSeq(s, "How did you integrate Business Central?");
    expect(s.seq).toBe(2);
    s = nextSeq(s, "");
    expect(s.seq).toBe(2);
  });
});

describe("phone keeps only the newest update", () => {
  it("ignores an older update that arrives late", () => {
    let shown: PhoneFeed | null = null;
    shown = acceptFeed(shown, feed(10, "Q2"));
    shown = acceptFeed(shown, feed(9, "Q1")); // late, older
    expect(shown?.state?.question).toBe("Q2");
    shown = acceptFeed(shown, feed(11, "Q3"));
    expect(shown?.state?.question).toBe("Q3");
  });
  it("accepts same-rev changes (phone button press, heartbeat)", () => {
    const a = feed(5, "Q");
    const b = { ...a, viewerSeenAt: "2026-11-17T10:00:00Z" };
    expect(acceptFeed(a, b)).toBe(b);
  });
  it("question and answer always come from the same update", () => {
    let shown: PhoneFeed | null = null;
    for (const f of [feed(1, "Q1"), feed(3, "Q2"), feed(2, "Q1")]) shown = acceptFeed(shown, f);
    expect(shown?.state?.answer).toBe(`answer for ${shown?.state?.question}`);
  });
});

describe("publisher", () => {
  it("sends the newest value, at most one request at a time, in order", async () => {
    vi.useFakeTimers();
    const sent: number[] = [];
    let release: (() => void) | null = null;
    const p = createPublisher<number>((v) => new Promise<void>((r) => { sent.push(v); release = r; }), 150);
    p.update(1, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([1]);
    p.update(2);
    p.update(3);
    p.update(4, true); // urgent while 1 is in flight: goes right after it
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent).toEqual([1]); // still waiting for the first request
    release!();
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([1, 4]); // 2 and 3 were superseded
    release!();
    vi.useRealTimers();
  });

  it("throttles non-urgent updates and skips duplicates", async () => {
    vi.useFakeTimers();
    const sent: string[] = [];
    const p = createPublisher<string>(async (v) => void sent.push(v), 150);
    p.update("a", true);
    await vi.advanceTimersByTimeAsync(0);
    p.update("a"); // same as last sent
    p.update("b");
    await vi.advanceTimersByTimeAsync(100);
    expect(sent).toEqual(["a"]);
    await vi.advanceTimersByTimeAsync(60);
    expect(sent).toEqual(["a", "b"]);
    await p.final("end");
    expect(sent).toEqual(["a", "b", "end"]);
    p.update("after");
    await vi.advanceTimersByTimeAsync(500);
    expect(sent).toEqual(["a", "b", "end"]);
    vi.useRealTimers();
  });
});

describe("presence", () => {
  it("is recent when we watched it change, or the timestamp is close", () => {
    const now = Date.parse("2026-11-17T10:00:30Z");
    expect(seenRecently("2026-11-17T10:00:20Z", 0, now)).toBe(true);
    expect(seenRecently("2026-11-17T09:59:00Z", 0, now)).toBe(false);
    expect(seenRecently("2026-11-17T09:59:00Z", now - 5_000, now)).toBe(true);
    expect(seenRecently(null, 0, now)).toBe(false);
  });
});
