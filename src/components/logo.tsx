/**
 * The Furry Gallery logo: a round emblem (paw with the name around it) and a
 * wordmark (small emblem + name). Colours follow the theme's accent.
 */
import { useId } from "react";
import { cn } from "@/lib/utils";

function Paw({ className }: { className?: string }) {
  return (
    <g className={className}>
      <ellipse cx="50" cy="60" rx="15" ry="12.5" />
      <ellipse cx="32.5" cy="43" rx="6" ry="8" transform="rotate(-20 32.5 43)" />
      <ellipse cx="44.5" cy="33" rx="6" ry="8" transform="rotate(-6 44.5 33)" />
      <ellipse cx="55.5" cy="33" rx="6" ry="8" transform="rotate(6 55.5 33)" />
      <ellipse cx="67.5" cy="43" rx="6" ry="8" transform="rotate(20 67.5 43)" />
    </g>
  );
}

/** Round badge: paw in the middle, "FURRY GALLERY" running around it. */
export function LogoEmblem({
  className,
  withText = true,
}: {
  className?: string;
  withText?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label="Furry Gallery"
      className={cn("text-accent", className)}
    >
      <defs>
        <radialGradient id={`${uid}bg`} cx="0.35" cy="0.3" r="0.9">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.06" />
        </radialGradient>
        <path id={`${uid}arc`} d="M50 50 m-38 0 a38 38 0 1 1 76 0 a38 38 0 1 1 -76 0" />
      </defs>
      <circle cx="50" cy="50" r="48" fill={`url(#${uid}bg)`} />
      <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle
        cx="50"
        cy="50"
        r="30"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="0.8"
      />
      {withText ? (
        <>
          <text
            fill="currentColor"
            fontSize="10.5"
            fontWeight="600"
            letterSpacing="3.2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <textPath href={`#${uid}arc`} startOffset="2%">
              FURRY GALLERY
            </textPath>
          </text>
          <path d="M14 58 l1.6 -3.2 l1.6 3.2 l-3.2 -1.2 h3.2 z" fill="currentColor" opacity="0.8" />
          <path
            d="M82.8 58 l1.6 -3.2 l1.6 3.2 l-3.2 -1.2 h3.2 z"
            fill="currentColor"
            opacity="0.8"
          />
        </>
      ) : null}
      <g
        transform={`translate(50 52) scale(${withText ? 0.6 : 1}) translate(-50 -50)`}
        fill="currentColor"
      >
        <Paw />
      </g>
    </svg>
  );
}

/** Wordmark: small emblem + "Furry Gallery" in a framed pill. */
export function LogoWordmark({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-accent/40 bg-gradient-to-r from-accent/15 to-transparent py-1 pr-3.5 pl-1",
        className,
      )}
    >
      <LogoEmblem withText={false} className={compact ? "size-7" : "size-9"} />
      <span
        className={cn(
          "font-display leading-none tracking-tight whitespace-nowrap",
          compact ? "text-base" : "text-xl",
        )}
      >
        Furry <span className="text-accent">Gallery</span>
      </span>
    </span>
  );
}
