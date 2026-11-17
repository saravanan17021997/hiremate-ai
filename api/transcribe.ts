// POST /api/transcribe?sessionId=… — one recorded speech segment (webm/opus) to text.
// Only for a live session of this user that recorded consent and hasn't ended: the consent lock.
import { transcribe } from "../src/main/live/transcribe";
import { HttpError, env, groqKey, query, readBody, requireUser, route, sendJson } from "./_lib/server";


export default route(["POST"], async (req, res) => {
  const { db } = await requireUser(req);
  const sessionId = query(req, "sessionId");
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new HttpError(400, "Start a live session first.");
  const { data: s, error } = await db.from("sessions").select("kind, consent_at, ended_at").eq("id", sessionId).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!s || s.kind !== "live" || !s.consent_at || s.ended_at) throw new HttpError(403, "Listening is only allowed during a live session with consent confirmed.");
  const audio = await readBody(req, 4 * 1024 * 1024);
  if (audio.length < 200) return sendJson(res, 200, { text: "", confidence: null, unclear: false });
  const mime = (req.headers["content-type"] ?? "audio/webm").split(";")[0];
  const result = await transcribe("groq", groqKey(), new Uint8Array(audio), mime, { baseUrl: env("HIREMATE_STT_BASE_URL") || undefined });
  sendJson(res, 200, result);
});
