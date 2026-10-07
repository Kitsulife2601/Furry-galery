/** A whole "look" (what the shop sheet and the look picker preview). */
import type { AvatarDecoration, NamePlate as NamePlateId, ProfileEffect } from "./decorations";
import type { NameStyle } from "./rewards";
import type { ShopKind } from "./shop";

export type LookState = {
  background: string | null;
  decoration: AvatarDecoration | null;
  effect: ProfileEffect | null;
  nameStyle: NameStyle | null;
  plate: NamePlateId | null;
};

/** The look with one item swapped in. */
export function withItem(look: LookState, kind: ShopKind, id: string): LookState {
  if (kind === "background") return { ...look, background: id };
  if (kind === "decoration") return { ...look, decoration: id as AvatarDecoration };
  if (kind === "effect") return { ...look, effect: id as ProfileEffect };
  if (kind === "plate") return { ...look, plate: id as NamePlateId };
  return { ...look, nameStyle: id as NameStyle };
}
