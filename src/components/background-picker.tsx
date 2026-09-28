import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { BACKGROUNDS } from "@/lib/vela/backgrounds";
import { shopPrice } from "@/lib/vela/shop";
import { cn } from "@/lib/utils";

export function BackgroundPicker({
  value,
  onChange,
  isLocked = () => false,
}: {
  value: string;
  onChange: (id: string) => void;
  /** Premium background not bought yet: the tile links to the shop instead. */
  isLocked?: (id: string) => boolean;
}) {
  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
      {BACKGROUNDS.map((bg) => {
        const selected = bg.id === value;
        if (!selected && isLocked(bg.id)) {
          return (
            <li key={bg.id}>
              <Link
                to="/shop"
                className="relative block w-full overflow-hidden rounded-xl border border-border p-1.5 text-left hover:border-border-strong"
              >
                <span className="bg-swatch block h-16 rounded-lg opacity-70" data-bg={bg.id} />
                <span className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-full bg-bg/80 px-1.5 py-0.5 text-[10px] text-fg-muted">
                  <Lock className="size-3" /> 🐾 {shopPrice("background", bg.id)}
                </span>
                <span className="mt-2 block px-1 text-xs font-medium">{bg.label}</span>
                <span className="block px-1 pb-1 text-[11px] text-fg-subtle">Im Shop</span>
              </Link>
            </li>
          );
        }
        return (
          <li key={bg.id}>
            <button
              type="button"
              onClick={() => onChange(bg.id)}
              aria-pressed={selected}
              className={cn(
                "w-full overflow-hidden rounded-xl border p-1.5 text-left transition-colors",
                selected ? "border-accent ring-1 ring-accent" : "border-border hover:border-border-strong",
              )}
            >
              <span
                className="bg-swatch block h-16 rounded-lg"
                data-bg={bg.id}
              />
              <span className="mt-2 block px-1 text-xs font-medium">{bg.label}</span>
              <span className="block px-1 pb-1 text-[11px] text-fg-subtle">
                {bg.hint}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
