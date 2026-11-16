import { describe, expect, it } from "vitest";
import { parseAnswer } from "./answerMeta";

describe("parseAnswer", () => {
  it("reads the type and confidence lines and keeps only the answer", () => {
    expect(parseAnswer("Question type: Technical\nI have used REST APIs daily.\n\nConfidence: High")).toEqual({
      questionType: "Technical", confidence: "High", body: "I have used REST APIs daily.",
    });
  });
  it("handles bold labels and US spelling", () => {
    expect(parseAnswer("**Question type:** behavioral\n**Situation** x\n**Confidence:** Low")).toMatchObject({ questionType: "Behavioural", confidence: "Low" });
  });
  it("hides a half-arrived first line while streaming", () => {
    expect(parseAnswer("Question ty").body).toBe("");
    expect(parseAnswer("Question type: HR\nI enj").body).toBe("I enj");
  });
  it("leaves answers without meta lines alone", () => {
    expect(parseAnswer("Just an answer.")).toEqual({ questionType: null, confidence: null, body: "Just an answer." });
  });
  it("also finds a confidence written at the end of the last sentence", () => {
    const p = parseAnswer("Question type: Technical\nHTML is the markup language for web pages. Confidence: High");
    expect(p).toEqual({ questionType: "Technical", confidence: "High", body: "HTML is the markup language for web pages." });
    expect(parseAnswer("Question type: General\nI'm confident about this. (Confidence: low)").confidence).toBe("Low");
    expect(parseAnswer("Question type: General\nMy confidence: it grew a lot.").confidence).toBeNull();
  });
});
