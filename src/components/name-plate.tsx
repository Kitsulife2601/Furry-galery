import type { CSSProperties, ReactNode } from "react";
import type { NamePlate as NamePlateId } from "@/lib/vela/decorations";
import { genPlateStyle, isGeneratedId } from "@/lib/vela/catalog";
import { cn } from "@/lib/utils";

/** A decorated strip behind a name (shop item); plain children without one. */
export function NamePlate({
  plate,
  children,
  className,
}: {
  plate: NamePlateId | null | undefined;
  children: ReactNode;
  className?: string;
}) {
  if (!plate) return <>{children}</>;
  const generated = isGeneratedId(plate);
  return (
    <span
      className={cn("name-plate", generated ? "plate-gen" : `plate-${plate}`, className)}
      style={generated ? (genPlateStyle(plate) as CSSProperties) : undefined}
    >
      <span className="relative z-10">{children}</span>
    </span>
  );
}
