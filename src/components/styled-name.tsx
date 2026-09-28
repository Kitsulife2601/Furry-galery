import type { NameStyle } from "@/lib/vela/rewards";
import { cn } from "@/lib/utils";

/** A name with its animated style (a reward); plain text without one. */
export function StyledName({
  text,
  nameStyle,
  className,
}: {
  text: string;
  nameStyle: NameStyle | null | undefined;
  className?: string;
}) {
  if (!nameStyle) return <span className={className}>{text}</span>;
  if (nameStyle === "welle") {
    return (
      <span className={cn("name-welle", className)} aria-label={text}>
        {Array.from(text).map((ch, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="deco-anim inline-block whitespace-pre"
            style={{ animationDelay: `${i * 0.08}s` }}
          >
            {ch}
          </span>
        ))}
      </span>
    );
  }
  return (
    <span className={cn("relative", `name-${nameStyle}`, className)}>
      <span className="deco-anim name-fill">{text}</span>
      {nameStyle === "glitzer" ? (
        <>
          <span aria-hidden="true" className="deco-anim name-spark" style={{ left: "10%" }}>
            ✦
          </span>
          <span
            aria-hidden="true"
            className="deco-anim name-spark"
            style={{ left: "70%", animationDelay: "0.9s" }}
          >
            ✦
          </span>
        </>
      ) : null}
    </span>
  );
}
