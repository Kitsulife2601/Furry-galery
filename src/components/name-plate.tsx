import type { ReactNode } from "react";
import type { NamePlate as NamePlateId } from "@/lib/vela/decorations";
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
  return (
    <span className={cn("name-plate", `plate-${plate}`, className)}>
      <span className="relative z-10">{children}</span>
    </span>
  );
}
