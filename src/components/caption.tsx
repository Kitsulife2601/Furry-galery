import { Link } from "@tanstack/react-router";
import { splitCaption } from "@/lib/vela/hashtags";
import { cn } from "@/lib/utils";

/** Caption text with #hashtags linking to the Gallery. */
export function Caption({
  text,
  className,
  onNavigate,
}: {
  text: string;
  className?: string;
  onNavigate?: () => void;
}) {
  return (
    <p className={cn("text-sm leading-snug break-words", className)}>
      {splitCaption(text).map((part, i) =>
        part.hashtag ? (
          <Link
            key={i}
            to="/explore"
            search={{ hashtag: part.hashtag }}
            onClick={onNavigate}
            className="pointer-events-auto font-medium text-accent hover:underline"
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
