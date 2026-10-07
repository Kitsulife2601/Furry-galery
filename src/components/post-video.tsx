import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { setFeedMuted, toggleFeedMuted, useFeedMuted } from "@/lib/vela/feed-prefs";

/** Controls inside the slide's big tap button: must not open the viewer. */
function stop(e: MouseEvent | KeyboardEvent) {
  e.stopPropagation();
}

function onKeyActivate(e: KeyboardEvent, fn: () => void) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    e.stopPropagation();
    fn();
  }
}

/**
 * Feed video: plays looped while on screen, pauses when scrolled away or when
 * `hold` is set (post opened big). Fitted like FittedImage, with the blurred
 * poster behind it. Pause/play and sound sit top right; a thin bar shows progress.
 */
export function FeedVideo({
  src,
  poster,
  label,
  className,
  hold = false,
  pauseSignal = 0,
}: {
  src: string;
  poster: string;
  label: string;
  className?: string;
  /** Keep paused (e.g. while the post viewer is open). */
  hold?: boolean;
  /** Bump to toggle pause from outside (keyboard shortcut). */
  pauseSignal?: number;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const muted = useFeedMuted();
  const [visible, setVisible] = useState(false);
  const [userPaused, setUserPaused] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const on = Boolean(entry?.isIntersecting);
        setVisible(on);
        // Scrolling away and back starts it again.
        if (!on) setUserPaused(false);
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const shouldPlay = visible && !hold && !userPaused;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!shouldPlay) {
      el.pause();
      return;
    }
    el.play().catch(() => {
      // Browsers block autoplay with sound before the first tap: start muted
      // for now (without forgetting the saved choice).
      if (el.muted) return;
      el.muted = true;
      setFeedMuted(true, false);
      void el.play().catch(() => undefined);
    });
  }, [shouldPlay]);

  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);

  function togglePause() {
    setUserPaused((p) => !p);
  }

  const firstSignal = useRef(pauseSignal);
  useEffect(() => {
    if (pauseSignal === firstSignal.current) return;
    firstSignal.current = pauseSignal;
    setUserPaused((p) => !p);
  }, [pauseSignal]);

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
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (bar.current && v.duration > 0) {
            bar.current.style.transform = `scaleX(${v.currentTime / v.duration})`;
          }
        }}
        className="relative h-full w-full object-contain"
      />

      <span
        aria-hidden="true"
        className={cn(
          "feed-paused pointer-events-none absolute top-1/2 left-1/2 z-10 grid size-16 place-items-center rounded-full bg-bg/45 text-on-media backdrop-blur-sm",
          userPaused && "feed-paused-on",
        )}
      >
        <Play className="size-7 translate-x-0.5 fill-on-media" />
      </span>

      <span className="absolute top-16 right-3 z-10 flex flex-col gap-2 md:top-4">
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            stop(e);
            togglePause();
          }}
          onKeyDown={(e) => onKeyActivate(e, togglePause)}
          aria-label={userPaused ? "Video abspielen" : "Video anhalten"}
          aria-pressed={userPaused}
          className="grid size-11 place-items-center rounded-full bg-bg/55 text-on-media backdrop-blur-md transition-colors hover:bg-bg/75"
        >
          {userPaused ? <Play className="size-5 fill-on-media" /> : <Pause className="size-5" />}
        </span>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            stop(e);
            toggleFeedMuted();
          }}
          onKeyDown={(e) => onKeyActivate(e, toggleFeedMuted)}
          aria-label={muted ? "Ton an" : "Ton aus"}
          aria-pressed={!muted}
          className="grid size-11 place-items-center rounded-full bg-bg/55 text-on-media backdrop-blur-md transition-colors hover:bg-bg/75"
        >
          {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
        </span>
      </span>

      <span className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-0.5 bg-on-media/15">
        <span
          ref={bar}
          className="block h-full origin-left bg-on-media/80"
          style={{ transform: "scaleX(0)" }}
        />
      </span>
    </span>
  );
}
