// Laptop side of the phone screen: sends the live session's current question and suggested reply to your
// phone, and carries out the buttons pressed there. Web version only (window.hiremate.phone.available).
import { useEffect, useRef, useState } from "react";
import type { PanelAction, PhoneFeed, PhoneFeedState } from "@shared/types";
import { acceptFeed, createPublisher, nextSeq, seenRecently } from "./phoneFeed";

type Feed = { active: boolean; sessionId: string | null; seq: number; state: PhoneFeedState | null };

export function usePhoneRelay(opts: {
  /** false: don't send (e.g. the live session runs on the phone itself). */
  enabled?: boolean;
  sessionId: string;
  state: PhoneFeedState;
  /** A phone button press. `forCurrent` is false when it was pressed for an older question. */
  onAction: (action: PanelAction, forCurrent: boolean) => void;
}) {
  const phone = window.hiremate.phone;
  const enabled = phone.available && opts.enabled !== false;
  const [phoneConnected, setPhoneConnected] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const seq = useRef({ question: "", seq: 0 });
  seq.current = nextSeq(seq.current, opts.state.question);
  const onAction = useRef(opts.onAction);
  onAction.current = opts.onAction;

  const publisher = useRef<ReturnType<typeof createPublisher<Feed>> | null>(null);
  const lastSent = useRef<{ seq: number; status: string; requestId: string | null } | null>(null);
  const lastSentAt = useRef(0);

  // One publisher per session; "ended" is sent when the session closes.
  useEffect(() => {
    if (!enabled) return;
    const p = createPublisher<Feed>(async (f) => {
      const r = await phone.publish(f);
      lastSentAt.current = Date.now();
      setProblem(r.ok ? null : r.error);
      if (!r.ok) throw new Error(r.error);
    });
    publisher.current = p;
    const id = opts.sessionId;
    return () => {
      publisher.current = null;
      void p.final({ active: false, sessionId: id, seq: seq.current.seq, state: null });
    };
  }, [enabled, opts.sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Every change of what the laptop shows goes to the phone. New questions and status changes go at once.
  useEffect(() => {
    const p = publisher.current;
    if (!p) return;
    const s = opts.state;
    const prev = lastSent.current;
    const urgent = !prev || prev.seq !== seq.current.seq || prev.status !== s.status || prev.requestId !== s.requestId;
    lastSent.current = { seq: seq.current.seq, status: s.status, requestId: s.requestId };
    p.update({ active: true, sessionId: opts.sessionId, seq: seq.current.seq, state: s }, urgent);
  }, [opts.state, opts.sessionId]);

  // "Laptop still here" while nothing changes, so the phone can tell a quiet meeting from a closed laptop.
  useEffect(() => {
    if (!enabled) return;
    const t = window.setInterval(() => {
      if (Date.now() - lastSentAt.current > 8_000) void phone.seen("laptop").then(() => (lastSentAt.current = Date.now()));
    }, 2_000);
    return () => window.clearInterval(t);
  }, [enabled, phone]);

  // The phone's button presses, and whether the phone screen is open.
  useEffect(() => {
    if (!enabled) return;
    let feed: PhoneFeed | null = null;
    let handled: string | null | undefined; // undefined = first look: an old press from before must not run now
    let viewerSeen: string | null = null;
    let viewerChangedAt = 0;
    const stop = phone.watch((next) => {
      feed = acceptFeed(feed, next);
      if (!feed) return;
      if (feed.viewerSeenAt !== viewerSeen) {
        if (viewerSeen !== null) viewerChangedAt = Date.now();
        viewerSeen = feed.viewerSeenAt;
      }
      setPhoneConnected(seenRecently(viewerSeen, viewerChangedAt, Date.now()));
      const req = feed.request;
      if (handled === undefined) {
        handled = req?.id ?? null;
        return;
      }
      if (req && req.id !== handled) {
        handled = req.id;
        onAction.current(req.action, req.seq === seq.current.seq);
      }
    }, () => undefined);
    const t = window.setInterval(() => setPhoneConnected(seenRecently(viewerSeen, viewerChangedAt, Date.now())), 5_000);
    return () => {
      stop();
      window.clearInterval(t);
    };
  }, [enabled, phone]);

  return { enabled, phoneConnected, problem, seq: seq.current.seq };
}
