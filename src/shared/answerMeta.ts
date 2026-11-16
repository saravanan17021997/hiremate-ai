// Splits an AI answer into its parts: the "Question type:" first line, the answer body,
// and the "Confidence:" last line. Works while the answer is still streaming in.

export type Confidence = "High" | "Medium" | "Low";

export interface ParsedAnswer {
  questionType: string | null;
  confidence: Confidence | null;
  body: string;
}

const TYPE_LINE = /^\s*\**\s*question type\s*:?\s*\**\s*:?\s*([A-Za-z]+)\**\s*$/im;
const CONF_LINE = /^\s*\**\s*confidence\s*:?\s*\**\s*:?\s*(high|medium|low)\b.*$/im;

const CONF_INLINE = /\s*\(?\**\s*confidence\s*:\s*\**\s*(high|medium|low)\s*\**\)?\.?\s*$/i;

export function parseAnswer(raw: string): ParsedAnswer {
  let text = raw.replace(/\r/g, "");
  let questionType: string | null = null;
  let confidence: Confidence | null = null;

  // While the first line is still arriving, hide a partial "Question type…" so it doesn't flash.
  const firstLine = text.split("\n", 1)[0];
  if (!text.includes("\n") && "question type:".startsWith(firstLine.trim().replace(/\*/g, "").toLowerCase().slice(0, 14)) && firstLine.trim()) {
    return { questionType: null, confidence: null, body: "" };
  }

  const t = text.match(TYPE_LINE);
  if (t && text.indexOf(t[0]) <= 2) {
    questionType = t[1][0].toUpperCase() + t[1].slice(1).toLowerCase();
    if (questionType === "Behavioral") questionType = "Behavioural";
    if (questionType === "Hr") questionType = "HR";
    text = text.replace(t[0], "");
  }
  const c = text.match(CONF_LINE) ?? text.match(CONF_INLINE); // own line, or tacked onto the last sentence
  if (c) {
    confidence = (c[1][0].toUpperCase() + c[1].slice(1).toLowerCase()) as Confidence;
    text = text.replace(c[0], "");
  }
  return { questionType, confidence, body: text.trim() };
}
