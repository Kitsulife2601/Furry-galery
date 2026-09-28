import { BACKGROUNDS } from "@/lib/vela/backgrounds";
import { cn } from "@/lib/utils";

export function BackgroundPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
      {BACKGROUNDS.map((bg) => {
        const selected = bg.id === value;
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
