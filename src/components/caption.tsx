import { Link } from "@tanstack/react-router";
import { splitCaption } from "@/lib/vela/hashtags";
import { cn } from "@/lib/utils";

/** @handle mentions (same rules as profile handles). */
const MENTION = /(^|[^\p{L}\p{N}_@])@([a-zA-Z0-9_]{3,20})(?![a-zA-Z0-9_])/gu;

type Part = { text: string; hashtag?: string; mention?: string };

function splitRichText(text: string): Part[] {
  const parts: Part[] = [];
  for (const part of splitCaption(text)) {
    if (part.hashtag) {
      parts.push(part);
      continue;
    }
    let last = 0;
    for (const match of part.text.matchAll(MENTION)) {
      const start = (match.index ?? 0) + match[1]!.length;
      if (start > last) parts.push({ text: part.text.slice(last, start) });
      parts.push({ text: `@${match[2]}`, mention: match[2]!.toLowerCase() });
      last = start + match[2]!.length + 1;
    }
    if (last < part.text.length) parts.push({ text: part.text.slice(last) });
  }
  return parts;
}

/** Text with #hashtags linking to the Gallery and @mentions linking to profiles. */
export function RichText({
  text,
  className,
  onNavigate,
}: {
  text: string;
  className?: string;
  onNavigate?: () => void;
}) {
  return (
    <p className={cn("text-sm leading-snug break-words whitespace-pre-line", className)}>
      {splitRichText(text).map((part, i) =>
        part.hashtag ? (
          <Link
            key={i}
            to="/explore"
            search={{ hashtag: part.hashtag }}
            onClick={onNavigate}
            className="pointer-events-auto rounded-sm font-medium text-accent hover:underline"
          >
            {part.text}
          </Link>
        ) : part.mention ? (
          <Link
            key={i}
            to="/u/$handle"
            params={{ handle: part.mention }}
            onClick={onNavigate}
            className="pointer-events-auto rounded-sm font-medium text-accent hover:underline"
          >
            {part.text}
          </Link>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </p>
  );
}

/** Caption text with #hashtags linking to the Gallery. */
export function Caption(props: { text: string; className?: string; onNavigate?: () => void }) {
  return <RichText {...props} />;
}
