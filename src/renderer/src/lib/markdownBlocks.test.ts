import { describe, expect, it } from "vitest";
import { parseMarkdown } from "./markdownBlocks";

describe("parseMarkdown", () => {
  it("reads headings, paragraphs, bold and lists", () => {
    const b = parseMarkdown("## Answer\nI built **n8n** flows.\nThey run daily.\n\n## Follow-up questions to expect\n- Why n8n?\n- How do you monitor it?\n1. One\n2. Two");
    expect(b[0]).toEqual({ type: "heading", text: "Answer" });
    expect(b[1]).toEqual({ type: "paragraph", parts: [{ text: "I built ", bold: false }, { text: "n8n", bold: true }, { text: " flows.", bold: false }, { text: " ", bold: false }, { text: "They run daily.", bold: false }] });
    expect(b[3]).toMatchObject({ type: "list", ordered: false, items: [[{ text: "Why n8n?" }], [{ text: "How do you monitor it?" }]] });
    expect(b[4]).toMatchObject({ type: "list", ordered: true });
  });
  it("treats HTML as plain text", () => {
    expect(parseMarkdown("<img src=x onerror=alert(1)>")).toEqual([{ type: "paragraph", parts: [{ text: "<img src=x onerror=alert(1)>", bold: false }] }]);
  });
});
