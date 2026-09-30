import { cn } from "@/lib/utils";

/**
 * Shows the whole image whatever its shape (portrait, landscape, square): it is
 * fitted into the frame, and the leftover space is filled with a blurred copy
 * of the same image instead of cropping it or leaving black bars.
 */
export function FittedImage({
  src,
  alt,
  className,
  alive = false,
}: {
  src: string;
  alt: string;
  className?: string;
  alive?: boolean;
}) {
  return (
    <span className={cn("relative block overflow-hidden bg-bg", className)}>
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl"
      />
      <img src={src} alt={alt} className={cn("relative h-full w-full object-contain", alive && "feed-alive")} />
    </span>
  );
}
