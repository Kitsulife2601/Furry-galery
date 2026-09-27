import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Feed video: plays muted and looped while on screen, pauses when scrolled
 * away. Fitted like FittedImage, with the blurred poster behind it.
 */
export function FeedVideo({
  src,
  poster,
  label,
  className,
}: {
  src: string;
  poster: string;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void el.play().catch(() => undefined);
        else el.pause();
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <span className={cn("relative block overflow-hidden bg-bg", className)}>
      <img
        src={poster}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl"
      />
      <video
        ref={ref}
        src={src}
        poster={poster}
        muted={muted}
        loop
        playsInline
        preload="metadata"
        aria-label={label}
        className="relative h-full w-full object-contain"
      />
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          setMuted((m) => !m);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            setMuted((m) => !m);
          }
        }}
        aria-label={muted ? "Ton an" : "Ton aus"}
        className="absolute top-16 right-3 z-10 grid size-11 place-items-center rounded-full bg-bg/60 text-on-media"
      >
        {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
      </span>
    </span>
  );
}
