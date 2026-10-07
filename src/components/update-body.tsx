/**
 * Renders the text of a site update: blank lines split paragraphs, lines that
 * start with "-", "*" or "•" become a bullet list. Plain text only (no HTML).
 */
import { cn } from "@/lib/utils";

type Block = { kind: "p"; lines: string[] } | { kind: "ul"; items: string[] };

const BULLET = /^\s*[-*•]\s+/;

function parseUpdateBody(body: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of body.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const last = blocks[blocks.length - 1];
    if (!line.trim()) {
      blocks.push({ kind: "p", lines: [] });
      continue;
    }
    if (BULLET.test(line)) {
      const item = line.replace(BULLET, "");
      if (last?.kind === "ul") last.items.push(item);
      else blocks.push({ kind: "ul", items: [item] });
    } else if (last?.kind === "p") {
      last.lines.push(line);
    } else {
      blocks.push({ kind: "p", lines: [line] });
    }
  }
  return blocks.filter((b) => (b.kind === "p" ? b.lines.length > 0 : b.items.length > 0));
}

export function UpdateBody({ body, className }: { body: string; className?: string }) {
  const blocks = parseUpdateBody(body);
  return (
    <div className={cn("space-y-2 text-sm leading-relaxed text-fg-muted", className)}>
      {blocks.map((b, i) =>
        b.kind === "ul" ? (
          <ul key={i} className="space-y-1">
            {b.items.map((item, j) => (
              <li key={j} className="flex gap-2">
                <span aria-hidden className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-accent" />
                <span className="min-w-0 break-words">{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className="break-words whitespace-pre-line">
            {b.lines.join("\n")}
          </p>
        ),
      )}
    </div>
  );
}
