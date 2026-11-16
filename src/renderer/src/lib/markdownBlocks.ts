// Turns the AI's simple Markdown (## headings, bullets, numbered lists, **bold**) into blocks.
// No HTML is ever injected: the page builds normal React elements from these blocks.

export type Inline = { text: string; bold: boolean };
export type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; parts: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] };

export function parseInline(text: string): Inline[] {
  const parts: Inline[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), bold: false });
    parts.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), bold: false });
  return parts;
}

export function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of md.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    const last = blocks[blocks.length - 1];
    if (heading) blocks.push({ type: "heading", text: heading[1].replace(/\*\*/g, "") });
    else if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const item = parseInline((bullet ?? numbered)![1]);
      if (last?.type === "list" && last.ordered === ordered) last.items.push(item);
      else blocks.push({ type: "list", ordered, items: [item] });
    } else if (last?.type === "paragraph") last.parts.push({ text: " ", bold: false }, ...parseInline(line));
    else blocks.push({ type: "paragraph", parts: parseInline(line) });
  }
  return blocks;
}
