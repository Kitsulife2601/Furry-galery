import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Shows the whole image whatever its shape (portrait, landscape, square): it is
 * fitted into the frame, and the leftover space is filled with a blurred copy
 * of the same image instead of cropping it or leaving black bars. The sharp
 * image fades in once loaded; until then a soft shimmer holds its place.
 */
export function FittedImage({
  src,
  alt,
  className,
  alive = false,
  eager = false,
}: {
  src: string;
  alt: string;
  className?: string;
  alive?: boolean;
  /** Load right away (first slide); otherwise the browser loads it when it comes near. */
  eager?: boolean;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  // Already decoded before hydration (or from cache): onLoad never fires.
  useEffect(() => {
    setLoaded(Boolean(ref.current?.complete && ref.current.naturalWidth > 0));
  }, [src]);

  return (
    <span className={cn("relative block overflow-hidden bg-bg", className)}>
      {loaded ? null : <span aria-hidden="true" className="fitted-shimmer absolute inset-0" />}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl"
      />
      <img
        ref={ref}
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={eager ? "high" : "auto"}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className={cn(
          "relative h-full w-full object-contain transition-opacity duration-500 motion-reduce:transition-none",
          loaded ? "opacity-100" : "opacity-0",
          alive && "feed-alive",
        )}
      />
    </span>
  );
}
