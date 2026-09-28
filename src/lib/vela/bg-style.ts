import type { CSSProperties } from "react";
import { genBackgroundVars } from "./catalog";

/** Inline CSS vars for generated backgrounds; hand-made ones come from styles.css. */
export function bgStyle(id: string | null | undefined, shell = false): CSSProperties | undefined {
  return id ? (genBackgroundVars(id, shell) as CSSProperties | undefined) : undefined;
}
