// Decides when the interviewer has finished asking something worth answering.

const STARTS = /^(what|why|how|when|where|which|who|whom|whose|can|could|would|will|should|do|does|did|is|are|was|were|have|has|tell me|describe|explain|walk me through|talk me through|give me|share|define|compare|what's|how's)\b/i;
const INSIDE = /\b(tell me about|walk me through|can you (explain|describe|tell)|could you (explain|describe|tell)|how would you|how do you|what would you|why did you|why do you|what is|what are|explain)\b/i;

/** True when the text reads like a question or a request to answer. */
// Short tag questions that don't need an answer ("Right?", "You know?").
const TAGS = /^(yes|no|yeah|right|okay|ok|sorry|pardon|really|hello|hi|you know|is it|isn't it|isn't that right|got it|all good|can you hear me|are you there)\?*$/i;

export function isLikelyQuestion(text: string): boolean {
  const t = text.trim();
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words < 2 || TAGS.test(t.replace(/[.,!]/g, "").trim())) return false;
  if (t.endsWith("?")) return true; // "What happened?" counts
  if (words < 3) return false;
  const core = t.replace(/^((so|and|okay|ok|alright|right|now|well|great|um|uh|then)[,.]?\s+)+/i, ""); // skip spoken fillers
  return STARTS.test(core) || INSIDE.test(core);
}

/** One transcribed piece of speech, with when it was spoken (performance.now() milliseconds). */
export interface HeardLine {
  text: string;
  startedAt: number;
  endedAt: number;
}

/**
 * The question to answer, once the newest line reads like a question.
 * A short lead-in spoken just before it ("So, about your last role.") is joined on, but only when the
 * gap is small: older talk is never mixed into a new question.
 */
export function pendingQuestion(lines: HeardLine[], maxGapMs = 2500): string | null {
  const last = lines[lines.length - 1];
  if (!last || !isLikelyQuestion(last.text)) return null;
  const prev = lines[lines.length - 2];
  const leadIn =
    prev && !isLikelyQuestion(prev.text) && last.startedAt - prev.endedAt <= maxGapMs && prev.text.split(/\s+/).length <= 15 ? prev.text : "";
  const joined = `${leadIn} ${last.text}`.replace(/\s+/g, " ").trim();
  return joined.length > 1000 ? joined.slice(-1000) : joined;
}

const ADD_ON = /^(and|or|but|also|plus|like|especially|for example|for instance|in|with|on|about|using|then)\b/i;

/**
 * Is speech that starts within `limitMs` of the last question the REST of that question (a short pause cut it
 * in two), or a NEW question? A finished question ("…Business Central?") followed by another complete question
 * ("What is your notice period?") is a new one, and must be answered on its own straight away.
 */
export function continuesQuestion(previous: string, next: string, gapMs: number, limitMs = 1000): boolean {
  if (gapMs >= limitMs) return false;
  const p = previous.trim();
  const t = next.trim();
  if (ADD_ON.test(t) || !isLikelyQuestion(t)) return true;
  // Finished: ends with "?", or is a full sentence ("Tell me about a challenging project.").
  // A short fragment like "Can you tell me." is still waiting for its second half.
  const finished = /\?\s*$/.test(p) || (/[.!]\s*$/.test(p) && p.split(/\s+/).length >= 5);
  const opensNew = /\?\s*$/.test(t) || STARTS.test(t);
  return !(finished && opensNew);
}
