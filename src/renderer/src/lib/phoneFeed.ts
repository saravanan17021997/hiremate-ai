// Phone screen logic shared by the laptop (sender) and the phone (viewer). Pure functions are kept
// separate from React so the ordering rules can be tested on their own.
import type { PhoneFeed } from "@shared/types";

/** Question numbering: a new number for a new question; the same number for a regenerate or for the
 *  rest of a question that a short pause cut in two ("Can you explain" → "Can you explain REST APIs?"). */
export function nextSeq(prev: { question: string; seq: number }, question: string): { question: string; seq: number } {
  const q = question.trim();
  if (!q || q === prev.question) return prev;
  if (prev.question && q.startsWith(prev.question)) return { question: q, seq: prev.seq };
  return { question: q, seq: prev.seq + 1 };
}

/** Which version of the row to show. Updates can arrive out of order (realtime and the 1-second check
 *  race each other): one with a lower rev is older, so it never replaces newer text. */
export function acceptFeed(prev: PhoneFeed | null, next: PhoneFeed | null): PhoneFeed | null {
  if (!next) return prev;
  if (!prev) return next;
  return next.rev >= prev.rev ? next : prev;
}

/**
 * Sends the laptop's state at most every `minGapMs`, newest only, one request at a time (so they reach the
 * database in order). Urgent updates (a new question, a status change, session start/end) go at once.
 */
export function createPublisher<T>(send: (value: T) => Promise<unknown>, minGapMs = 150) {
  let latest: { value: T; key: string } | null = null;
  let lastKey = "";
  let inFlight = false;
  let urgentWaiting = false;
  let lastSentAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const pump = async () => {
    if (inFlight || !latest || stopped) return;
    const item = latest;
    latest = null;
    urgentWaiting = false;
    if (item.key === lastKey) return;
    inFlight = true;
    lastSentAt = Date.now();
    try {
      await send(item.value);
      lastKey = item.key;
    } catch {
      /* a failed send is retried with the next update */
    } finally {
      inFlight = false;
      if (latest) schedule(urgentWaiting);
    }
  };

  const schedule = (urgent: boolean) => {
    clearTimeout(timer);
    if (stopped) return;
    const wait = urgent ? 0 : Math.max(0, lastSentAt + minGapMs - Date.now());
    timer = setTimeout(() => void pump(), wait);
  };

  return {
    update(value: T, urgent = false) {
      const key = JSON.stringify(value);
      if (key === lastKey && !latest) return;
      latest = { value, key };
      if (urgent) urgentWaiting = true;
      if (!inFlight) schedule(urgent);
    },
    /** Sends this now (after anything in flight), e.g. "session ended". */
    async final(value: T) {
      clearTimeout(timer);
      latest = null;
      while (inFlight) await new Promise((r) => setTimeout(r, 20));
      stopped = true;
      await send(value).catch(() => undefined);
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

/** "Seen recently": a heartbeat we watched change, or a timestamp within the window. */
export function seenRecently(iso: string | null, observedChangeAt: number, now: number, windowMs = 25_000): boolean {
  if (observedChangeAt && now - observedChangeAt < windowMs) return true;
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) && Math.abs(now - t) < windowMs;
}
