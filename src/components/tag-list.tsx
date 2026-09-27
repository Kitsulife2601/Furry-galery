import { tagLabel, type PostTag } from "@/lib/vela/types";
import { cn } from "@/lib/utils";

export function TagList({ tags, className }: { tags: PostTag[]; className?: string }) {
  if (tags.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {tags.map((t) => (
        <li key={t} className="rounded-full bg-fg/10 px-2 py-0.5 text-[11px] font-medium">
          #{tagLabel(t)}
        </li>
      ))}
    </ul>
  );
}
