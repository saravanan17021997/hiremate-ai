// POST /api/ask — streams an answer suggestion (Server-Sent Events) for one question,
// using the owner's Groq key and the signed-in user's own profile, projects and job description.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { buildFocusedContext, buildInterviewSystemPrompt, buildMeetingSystemPrompt, focusJobDescription } from "../src/main/interview/prompt";
import { loadBackground, saveItem, sessionItems } from "./_lib/data";
import { HttpError, MODEL, groq, groqKey, readJson, requireUser, route } from "./_lib/server";

const Body = z.object({
  requestId: z.string().uuid().optional(),
  question: z.string().trim().min(3, "Type a question first.").max(1000),
  mode: z.enum(["short", "medium", "detailed"]),
  sessionId: z.string().uuid(),
  regenerate: z.boolean().optional(),
  meetingNotes: z.string().max(4000).nullable().optional(), // set for live "Work meeting" sessions
});
const Test = z.object({ requestId: z.string().uuid().optional(), test: z.string().trim().min(1).max(500) });


export default route(["POST"], async (req, res) => {
  const { user, db } = await requireUser(req);
  const raw = await readJson(req);
  const t0 = Date.now();

  // Stream setup: one JSON event per line, same shapes as the desktop app's StreamEvent.
  const controller = new AbortController();
  req.on("close", () => { if (!res.writableEnded) controller.abort(); }); // the browser stopped or replaced this answer
  const start = () => {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
  };
  const send = (e: Record<string, unknown>) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(e)}\n\n`); };

  // Settings → "Test the connection".
  const test = Test.safeParse(raw);
  if (test.success) {
    const requestId = test.data.requestId ?? randomUUID();
    start();
    try {
      await groq().streamChat({
        apiKey: groqKey(), model: MODEL(), maxTokens: 300, signal: controller.signal,
        system: "You are the connection test inside HireMate AI, an interview preparation app. Reply in at most three short sentences.",
        messages: [{ role: "user", content: test.data.test }],
        onDelta: (text) => send({ requestId, type: "delta", text }),
      });
      send({ requestId, type: "done" });
    } catch (e) {
      send((e as Error).name === "AbortError" ? { requestId, type: "done" } : { requestId, type: "error", error: (e as Error).message });
    }
    return void res.end();
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  const { question, mode, sessionId, regenerate, meetingNotes } = parsed.data;
  const requestId = parsed.data.requestId ?? randomUUID();
  const key = groqKey();

  const [bg, items] = await Promise.all([loadBackground(db, user.id), sessionItems(db, sessionId)]);
  const context = buildFocusedContext(bg.profile, bg.projects, question);
  const jd = focusJobDescription(bg.jobDescription, question);
  const earlier = items.slice(-5);
  const prev = earlier[earlier.length - 1]?.question;
  if (prev && ((regenerate && prev === question) || (question.length > prev.length && question.startsWith(prev)))) earlier.pop();
  const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);
  const history = earlier.slice(-2).flatMap((h) => [
    { role: "user" as const, content: `<question>${clip(h.question, 300)}</question>` },
    { role: "assistant" as const, content: clip(h.answer, 500) },
  ]);

  start();
  send({ requestId, type: "status", stage: "sent" });
  let answer = "";
  let firstAt = 0;
  try {
    await groq().streamChat({
      apiKey: key,
      model: MODEL(),
      system: typeof meetingNotes === "string" ? buildMeetingSystemPrompt(context, meetingNotes, mode, jd) : buildInterviewSystemPrompt(context, mode, jd),
      messages: [...history, { role: "user", content: `<question>${question}</question>` }],
      maxTokens: { short: 300, medium: 650, detailed: 1100 }[mode],
      signal: controller.signal,
      onStage: (stage) => send({ requestId, type: "status", stage }),
      onDelta: (text) => {
        if (!firstAt) firstAt = Date.now();
        answer += text;
        send({ requestId, type: "delta", text });
      },
    });
    send({ requestId, type: "done" });
    console.log(`[ask] ${mode} · first words ${firstAt ? firstAt - t0 : "-"} ms · total ${Date.now() - t0} ms`);
    if (answer.trim()) await saveItem(db, sessionId, items, question, answer, Boolean(regenerate)).catch((e: Error) => console.warn("[ask] answer not saved:", e.message));
  } catch (e) {
    const err = e as Error;
    send(err.name === "AbortError" ? { requestId, type: "done" } : { requestId, type: "error", error: err.message });
  }
  res.end();
});
