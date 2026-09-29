/** Link from the upload page to "Deine Uploads" (/uploads), with the headline numbers. */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, ChevronRight } from "lucide-react";
import { listMyUploads } from "@/lib/vela/server";

export const MY_UPLOADS_KEY = ["my-uploads"] as const;

const number = new Intl.NumberFormat("de");

export function UploadsLink() {
  const query = useQuery({ queryKey: MY_UPLOADS_KEY, queryFn: () => listMyUploads() });
  const list = query.data ?? [];
  const views = list.reduce((sum, u) => sum + u.views, 0);
  const likes = list.reduce((sum, u) => sum + u.likes, 0);
  return (
    <Link
      to="/uploads"
      className="mt-10 flex items-center gap-3 rounded-2xl border border-border bg-bg-elevated/70 p-4 hover:border-border-strong"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
        <BarChart3 className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">Deine Uploads</span>
        <span className="block text-xs text-fg-muted">
          {list.length
            ? `${list.length} ${list.length === 1 ? "Beitrag" : "Beiträge"} · ${number.format(views)} Aufrufe · ${number.format(likes)} Likes`
            : "Alles, was du teilst, mit Aufrufen und Likes"}
        </span>
      </span>
      <ChevronRight className="size-5 text-fg-subtle" />
    </Link>
  );
}
