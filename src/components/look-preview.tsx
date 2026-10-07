/**
 * A small profile header showing a whole "look" (background, effect, frame,
 * name plate and name style) on the member's own avatar and name. Used by the
 * shop's item sheet and the look picker in the settings.
 */
import { memo } from "react";
import type { LookState } from "@/lib/vela/look";
import { bgStyle } from "@/lib/vela/bg-style";
import { DecoratedAvatar, ProfileEffectLayer } from "@/components/avatar-decoration";
import { NamePlate } from "@/components/name-plate";
import { StyledName } from "@/components/styled-name";
import { cn } from "@/lib/utils";

export const LookPreview = memo(function LookPreview({
  look,
  avatarUrl,
  name,
  handle,
  size = "lg",
  className,
}: {
  look: LookState;
  avatarUrl: string | null;
  name: string;
  handle?: string;
  size?: "md" | "lg";
  className?: string;
}) {
  const lg = size === "lg";
  return (
    <div
      className={cn(
        "relative isolate grid place-items-center overflow-hidden",
        look.background ? "bg-swatch" : "bg-bg-subtle",
        lg ? "h-72" : "h-48",
        className,
      )}
      data-bg={look.background ?? undefined}
      style={bgStyle(look.background)}
    >
      {look.effect ? <ProfileEffectLayer effect={look.effect} className="inset-0" /> : null}
      <div
        className={cn(
          "relative z-10 flex flex-col items-center px-4 text-center",
          lg ? "gap-6 pt-6" : "gap-4",
        )}
      >
        <DecoratedAvatar
          src={avatarUrl}
          name={name}
          decoration={look.decoration}
          className={lg ? "size-24" : "size-20"}
          imgClassName="border-2 border-bg"
          letterClassName={lg ? "text-3xl" : "text-2xl"}
        />
        <div className="flex max-w-full flex-col items-center gap-1">
          <NamePlate plate={look.plate} className={cn("font-display", lg ? "text-2xl" : "text-xl")}>
            <StyledName text={name} nameStyle={look.nameStyle} />
          </NamePlate>
          {handle ? (
            <span className="rounded-full bg-bg/55 px-2 py-0.5 text-xs text-fg-muted backdrop-blur-sm">
              @{handle}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
});
