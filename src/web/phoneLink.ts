// Phone screen link: the laptop's live session ⇄ your phone, through your own row in hiremate.live_feed.
// Updates arrive instantly through Supabase Realtime; if that isn't available (or drops), the page checks
// the row every second, so the phone keeps working either way. Row Level Security: only you can see it.
import type { HireMateApi } from "@shared/api";
import type { IpcResult } from "@shared/ipc";
import type { FeedLink, PhoneFeed, PhoneFeedState, PhoneRequest } from "@shared/types";
import { supabase } from "./supabase";

type Row = {
  user_id: string;
  active: boolean;
  session_id: string | null;
  rev: number | string;
  seq: number;
  state: PhoneFeedState | Record<string, never> | null;
  request: PhoneRequest | null;
  laptop_seen_at: string | null;
  viewer_seen_at: string | null;
};

const TABLE = "live_feed";
const FAST_POLL_MS = 1_000; // when realtime isn't connected
const SLOW_POLL_MS = 3_000; // safety net while realtime is connected (one tiny read)

const ok = <T>(data: T): IpcResult<T> => ({ ok: true, data });
const fail = (e: unknown): IpcResult<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

export function toFeed(r: Row | null | undefined): PhoneFeed | null {
  if (!r) return null;
  const state = r.state && typeof r.state === "object" && "status" in r.state ? (r.state as PhoneFeedState) : null;
  return {
    active: Boolean(r.active),
    sessionId: r.session_id ?? null,
    rev: Number(r.rev) || 0,
    seq: r.seq ?? 0,
    state,
    request: r.request ?? null,
    laptopSeenAt: r.laptop_seen_at ?? null,
    viewerSeenAt: r.viewer_seen_at ?? null,
  };
}

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Please sign in again.");
  return id;
}

async function fetchRow(id: string): Promise<Row | null> {
  const r = await supabase.from(TABLE).select("*").eq("user_id", id).maybeSingle();
  if (r.error) throw new Error(r.error.message);
  return (r.data as Row | null) ?? null;
}

// The laptop's update counter: always above anything already in the row, so the phone never
// mistakes a new update for an old one (even after the laptop page is reloaded).
let rev = 0;
let revReady: Promise<void> | null = null;
function ensureRev(id: string) {
  revReady ??= fetchRow(id)
    .then((row) => { rev = Math.max(rev, Number(row?.rev ?? 0), Date.now() * 1000); })
    .catch(() => { rev = Math.max(rev, Date.now() * 1000); });
  return revReady;
}

const upsert = async (fields: Partial<Row>) => {
  const id = await uid();
  const r = await supabase.from(TABLE).upsert({ user_id: id, ...fields }, { onConflict: "user_id" });
  if (r.error) throw new Error(r.error.code === "42P01" || /does not exist|schema cache/i.test(r.error.message) ? "Phone screen isn't set up yet: run supabase/hiremate_phone_screen.sql in Supabase (SQL Editor)." : r.error.message);
};

export function createPhoneApi(): HireMateApi["phone"] {
  return {
    available: true,

    async publish(feed) {
      try {
        const id = await uid();
        await ensureRev(id);
        rev += 1;
        await upsert({
          active: feed.active,
          session_id: feed.sessionId,
          seq: feed.seq,
          state: feed.state ?? {},
          rev,
          laptop_seen_at: new Date().toISOString(),
        });
        return ok(true);
      } catch (e) {
        return fail(e);
      }
    },

    async seen(role) {
      try {
        await upsert(role === "laptop" ? { laptop_seen_at: new Date().toISOString() } : { viewer_seen_at: new Date().toISOString() });
        return ok(true);
      } catch (e) {
        return fail(e);
      }
    },

    async request(req) {
      try {
        await upsert({ request: req });
        return ok(true);
      } catch (e) {
        return fail(e);
      }
    },

    watch(onFeed, onLink) {
      let closed = false;
      let realtime = false;
      let timer: number | undefined;
      let channel: ReturnType<typeof supabase.channel> | null = null;
      let id: string | null = null;
      let link: FeedLink = "connecting";
      const setLink = (l: FeedLink) => {
        if (l !== link) {
          link = l;
          onLink(l);
        }
      };
      onLink(link);

      const poll = async () => {
        if (closed || !id) return;
        try {
          onFeed(toFeed(await fetchRow(id)));
          if (!realtime) setLink("polling");
        } catch {
          setLink(navigator.onLine === false ? "offline" : realtime ? "live" : "polling");
        }
      };
      const schedule = () => {
        window.clearTimeout(timer);
        if (closed) return;
        timer = window.setTimeout(async () => {
          await poll();
          schedule();
        }, realtime ? SLOW_POLL_MS : FAST_POLL_MS);
      };

      // Realtime connection, re-made from scratch after any drop (with growing waits: 2, 4, 8, then 15 s).
      let retryTimer: number | undefined;
      let retryPending = false;
      let retries = 0;
      const retry = () => {
        if (closed || retryPending) return; // one retry at a time, however many errors arrive meanwhile
        retryPending = true;
        const wait = [2_000, 4_000, 8_000][retries] ?? 15_000;
        retries += 1;
        retryTimer = window.setTimeout(() => {
          retryPending = false;
          void subscribe();
        }, wait);
      };
      const subscribe = async () => {
        if (closed || !id) return;
        window.clearTimeout(retryTimer);
        retryPending = false;
        if (channel) {
          const old = channel;
          channel = null;
          void supabase.removeChannel(old);
        }
        realtime = false;
        // Join with the sign-in token, so Realtime applies your row's policy (an anonymous join would see nothing).
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) await supabase.realtime.setAuth(data.session.access_token).catch(() => undefined);
        if (closed) return;
        const ch = supabase
          .channel(`hiremate-live-${id}-${Date.now()}`)
          .on("postgres_changes", { event: "*", schema: "hiremate", table: TABLE, filter: `user_id=eq.${id}` }, (payload) => {
            const row = (payload.new && Object.keys(payload.new).length ? payload.new : null) as Row | null;
            if (row) onFeed(toFeed(row));
          });
        channel = ch;
        ch.subscribe((status) => {
          if (closed || ch !== channel) return; // a replaced connection's last words don't count
          if (status === "SUBSCRIBED") {
            realtime = true;
            retries = 0;
            setLink("live");
            void poll(); // catch anything that changed while connecting
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            realtime = false;
            setLink(navigator.onLine === false ? "offline" : "polling");
            retry();
          }
          schedule();
        });
      };

      const online = () => {
        void poll();
        void subscribe(); // a fresh connection after the network comes back
      };
      const offline = () => {
        realtime = false;
        setLink("offline");
      };
      const visible = () => {
        if (document.visibilityState === "visible") void poll();
      };
      window.addEventListener("online", online);
      window.addEventListener("offline", offline);
      document.addEventListener("visibilitychange", visible);

      void uid()
        .then((u) => {
          id = u;
          void poll();
          void subscribe();
          schedule();
        })
        .catch(() => setLink("offline"));

      return () => {
        closed = true;
        window.clearTimeout(timer);
        window.clearTimeout(retryTimer);
        window.removeEventListener("online", online);
        window.removeEventListener("offline", offline);
        document.removeEventListener("visibilitychange", visible);
        if (channel) void supabase.removeChannel(channel);
      };
    },
  };
}
