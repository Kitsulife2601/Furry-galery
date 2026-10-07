/**
 * Small helpers for stacked overlays (post viewer → ⋯ menu → report dialog → zoom):
 * Escape only closes the topmost layer, and the page behind does not scroll.
 */
import { useCallback, useEffect, useRef } from "react";

const stack: symbol[] = [];

/**
 * Calls `onEscape` when Escape is pressed and this layer is the topmost one.
 * Returns `isTop()` so other shortcuts (←/→) can check the same thing.
 */
export function useEscapeLayer(onEscape: () => void, enabled = true) {
  const handler = useRef(onEscape);
  const layer = useRef<symbol | null>(null);
  const isTop = useCallback(
    () => layer.current !== null && stack[stack.length - 1] === layer.current,
    [],
  );
  useEffect(() => {
    handler.current = onEscape;
  });
  useEffect(() => {
    if (!enabled) return;
    const id = Symbol("layer");
    layer.current = id;
    stack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (stack[stack.length - 1] !== id) return;
      e.preventDefault();
      handler.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const at = stack.indexOf(id);
      if (at >= 0) stack.splice(at, 1);
      layer.current = null;
    };
  }, [enabled]);
  return isTop;
}

let locks = 0;
let savedOverflow = "";

/** Locks page scrolling while mounted; restores focus to the opener on unmount. */
export function useModalBehaviour() {
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    if (locks === 0) {
      savedOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
    }
    locks += 1;
    return () => {
      locks -= 1;
      if (locks === 0) document.documentElement.style.overflow = savedOverflow;
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, []);
}
