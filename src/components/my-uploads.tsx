/** "Deine Uploads" on the upload page: everything you posted, with views and reactions. */
import { useQuery } from "@tanstack/react-query";
import { Eye, Heart, MessageCircle, Play, Repeat } from "lucide-react";
import { listMyUploads, type MyUpload } from "@/lib/vela/server";
import { Skeleton } from "@/components/ui/skeleton";

export const MY_UPLOADS_KEY = ["my-uploads"] as const;

const dayFormat = new Intl.DateTimeFormat("de", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function MyUploads() {
  const query = useQuery({ queryKey: MY_UPLOADS_KEY, queryFn: () => listMyUploads() });
  const list = query.data ?? [];
  const total = list.reduce(
    (sum, u) => ({
      views: sum.views + u.views,
      viewers: sum.viewers + u.viewers,
      likes: sum.likes + u.likes,
    }),
    { views: 0, viewers: 0, likes: 0 },
  );

  return (
    <section id="my-uploads" className="mt-12 scroll-mt-6">
      <h2 className="font-display text-2xl">Deine Uploads</h2>
      {list.length ? (
        <p className="mt-1 text-xs text-fg-subtle">
          {list.length} {list.length === 1 ? "Beitrag" : "Beiträge"} · angesehen von{" "}
          {total.viewers} {total.viewers === 1 ? "Person" : "Personen"} · {total.views}{" "}
          {total.views === 1 ? "Aufruf" : "Aufrufe"} insgesamt · {total.likes}{" "}
          {total.likes === 1 ? "Like" : "Likes"}
        </p>
      ) : null}
      {query.isPending ? (
        <Skeleton className="mt-4 h-24 w-full" />
      ) : list.length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">Noch nichts hochgeladen.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {list.map((u) => (
            <UploadRow key={u.id} upload={u} />
          ))}
        </ul>
      )}
      <p className="mt-4 text-[11px] leading-relaxed text-fg-subtle">
        Gezählt werden angemeldete Mitglieder im Feed, deine eigenen Aufrufe nicht. „Mehrfach“
        heißt: Die Person hat es sich mindestens zweimal angesehen.
      </p>
    </section>
  );
}

function UploadRow({ upload: u }: { upload: MyUpload }) {
  const stat = "flex items-center gap-1 tabular-nums";
  return (
    <li className="flex gap-3 rounded-xl border border-border bg-bg-elevated/60 p-2.5">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-bg-subtle">
        <img src={u.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        {u.isVideo ? (
          <span className="absolute right-1 bottom-1 grid size-5 place-items-center rounded-full bg-bg/80">
            <Play className="size-3" />
          </span>
        ) : null}
        {u.nsfw ? (
          <span className="absolute top-1 left-1 rounded bg-bg/80 px-1 text-[10px] font-semibold">
            18+
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {u.caption || <span className="text-fg-subtle">Ohne Text</span>}
        </p>
        <p className="text-[11px] text-fg-subtle">{dayFormat.format(new Date(u.createdAt))}</p>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-fg-muted">
          <span className={stat} title="Leute, die es angesehen haben">
            <Eye className="size-3.5" /> {u.viewers} gesehen
          </span>
          <span className={stat} title="Leute, die es mehrmals angesehen haben">
            <Repeat className="size-3.5" /> {u.repeatViewers} mehrfach
          </span>
          <span className={stat}>
            <Heart className="size-3.5" /> {u.likes} Likes
          </span>
          <span className={stat}>
            <MessageCircle className="size-3.5" /> {u.comments} Kommentare
          </span>
        </div>
        {u.views > u.viewers ? (
          <p className="mt-1 text-[11px] text-fg-subtle tabular-nums">
            {u.views} Aufrufe insgesamt
          </p>
        ) : null}
      </div>
    </li>
  );
}
