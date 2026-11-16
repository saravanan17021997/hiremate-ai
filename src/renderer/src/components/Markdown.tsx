// Renders AI answers safely as React elements (no raw HTML).
import { parseMarkdown, type Inline } from "../lib/markdownBlocks";

const Text = ({ parts }: { parts: Inline[] }) => <>{parts.map((p, i) => (p.bold ? <strong key={i} className="font-semibold text-mist">{p.text}</strong> : <span key={i}>{p.text}</span>))}</>;

export function Markdown({ text, streaming }: { text: string; streaming?: boolean }) {
  const blocks = parseMarkdown(text);
  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-haze" data-selectable>
      {blocks.map((b, i) => {
        const caret = streaming && i === blocks.length - 1 ? <span className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-electric-soft" /> : null;
        if (b.type === "heading") return <h3 key={i} className="pt-2 text-sm font-semibold text-electric-soft first:pt-0">{b.text}{caret}</h3>;
        if (b.type === "paragraph") return <p key={i} className="text-mist/90"><Text parts={b.parts} />{caret}</p>;
        const List = b.ordered ? "ol" : "ul";
        return (
          <List key={i} className={`space-y-1.5 pl-5 ${b.ordered ? "list-decimal" : "list-disc"} marker:text-dim`}>
            {b.items.map((item, j) => <li key={j}><Text parts={item} />{j === b.items.length - 1 ? caret : null}</li>)}
          </List>
        );
      })}
      {streaming && blocks.length === 0 && <span className="inline-block h-4 w-0.5 animate-pulse bg-electric-soft" />}
    </div>
  );
}
