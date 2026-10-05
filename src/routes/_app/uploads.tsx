/**
 * "Deine Uploads": your own posts with their numbers — headline tiles, the
 * five most-viewed posts as a bar ranking, then every upload as a grid.
 */
import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Eye, Heart, MessageCircle, Play, Plus, Repeat, Users } from "lucide-react";
import { listMyUploads, type MyUpload } from "@/lib/vela/server";
import { MY_UPLOADS_KEY } from "@/components/my-uploads";
import { Button } from "@/components/ui/button";
import { PostViewerLoader } from "@/components/post-viewer-loader";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/uploads")({ component: Uploads });

type Sort = "new" | "views" | "likes";
const SORTS: { id: Sort; label: string }[] = [
  { id: "new", label: "Neueste" },
  { id: "views", label: "Meiste Aufrufe" },
  { id: "likes", label: "Meiste Likes" },
];

const number = new Intl.NumberFormat("de");
const day = new Intl.DateTimeFormat("de", { day: "numeric", month: "short" });

function Uploads() {
  const query = useQuery({ queryKey: MY_UPLOADS_KEY, queryFn: () => listMyUploads() });
  const [sort, setSort] = useState<Sort>("new");
  const [openId, setOpenId] = useState<number | null>(null);
  const list = query.data ?? [];

  const totals = list.reduce(
    (t, u) => ({
      views: t.views + u.views,
      viewers: t.viewers + u.viewers,
      repeat: t.repeat + u.repeatViewers,
      likes: t.likes + u.likes,
      comments: t.comments + u.comments,
    }),
    { views: 0, viewers: 0, repeat: 0, likes: 0, comments: 0 },
  );
  const top = [...list]
    .sort((a, b) => b.views - a.views)
    .filter((u) => u.views > 0)
    .slice(0, 5);
  const maxViews = Math.max(1, ...top.map((u) => u.views));
  const sorted = [...list].sort((a, b) =>
    sort === "views"
      ? b.views - a.views
      : sort === "likes"
        ? b.likes - a.likes
        : b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 pb-24 md:pt-20">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.22em] text-fg-subtle uppercase">Übersicht</p>
          <h1 className="mt-1 font-display text-3xl">Deine Uploads</h1>
        </div>
        <Button asChild size="sm">
          <Link to="/upload">
            <Plus className="size-4" /> Hochladen
          </Link>
        </Button>
      </div>

      {query.isPending ? (
        <Skeleton className="mt-8 h-64 w-full" />
      ) : list.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="font-display text-xl">Noch nichts hochgeladen</p>
          <p className="mt-1 text-sm text-fg-muted">
            Sobald du etwas teilst, siehst du hier, wie es ankommt.
          </p>
          <Button asChild className="mt-5">
            <Link to="/upload">Erstes Bild hochladen</Link>
          </Button>
        </div>
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile icon={Eye} label="Aufrufe" value={totals.views} />
            <Tile
              icon={Users}
              label="Personen erreicht"
              value={totals.viewers}
              hint={totals.repeat ? `${number.format(totals.repeat)} kamen wieder` : undefined}
            />
            <Tile icon={Heart} label="Likes" value={totals.likes} />
            <Tile icon={MessageCircle} label="Kommentare" value={totals.comments} />
          </dl>
          <p className="mt-2 text-[11px] text-fg-subtle">
            {list.length} {list.length === 1 ? "Beitrag" : "Beiträge"} · gezählt werden angemeldete
            Mitglieder, deine eigenen Aufrufe nicht.
          </p>

          {top.length ? (
            <section className="mt-10">
              <h2 className="font-display text-xl">Am meisten angesehen</h2>
              <ol className="mt-4 space-y-2.5">
                {top.map((u, i) => (
                  <li
                    key={u.id}
                    className="flex items-center gap-3"
                    title={`${number.format(u.views)} Aufrufe · ${number.format(u.viewers)} Personen · ${number.format(u.likes)} Likes`}
                  >
                    <span className="w-4 text-right text-xs text-fg-subtle tabular-nums">
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => setOpenId(u.id)}
                      aria-label="Beitrag öffnen"
                      className="shrink-0"
                    >
                      <Thumb upload={u} className="size-10 rounded-md" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-fg-muted">
                        {u.caption || day.format(new Date(u.createdAt))}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-bg-subtle">
                          <div
                            className="h-full rounded-full bg-accent transition-[width] duration-500"
                            style={{ width: `${Math.max(3, (u.views / maxViews) * 100)}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-xs font-medium tabular-nums">
                          {number.format(u.views)}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <section className="mt-10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-xl">Alle Beiträge</h2>
              <div className="flex gap-1">
                {SORTS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={sort === s.id}
                    onClick={() => setSort(s.id)}
                    className={cn(
                      "h-8 rounded-lg px-3 text-xs",
                      sort === s.id ? "bg-bg-subtle text-fg" : "text-fg-muted hover:text-fg",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {sorted.map((u) => (
                <li key={u.id} className="overflow-hidden rounded-xl border border-border">
                  <button
                    type="button"
                    onClick={() => setOpenId(u.id)}
                    aria-label="Beitrag öffnen"
                    className="relative block aspect-square w-full"
                  >
                    <Thumb upload={u} className="h-full w-full" />
                    <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-linear-to-t from-black/80 to-transparent px-2.5 pt-6 pb-2 text-xs text-white">
                      <span className="flex items-center gap-1 tabular-nums">
                        <Eye className="size-3.5" /> {number.format(u.views)}
                      </span>
                      <span className="flex items-center gap-1 tabular-nums">
                        <Heart className="size-3.5" /> {number.format(u.likes)}
                      </span>
                      <span className="flex items-center gap-1 tabular-nums">
                        <MessageCircle className="size-3.5" /> {number.format(u.comments)}
                      </span>
                    </div>
                  </button>
                  <div className="px-2.5 py-2">
                    <p className="truncate text-xs">
                      {u.caption || <span className="text-fg-subtle">Ohne Text</span>}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-fg-subtle">
                      {day.format(new Date(u.createdAt))} · {number.format(u.viewers)}{" "}
                      {u.viewers === 1 ? "Person" : "Personen"}
                      {u.repeatViewers ? (
                        <>
                          {" "}
                          · <Repeat className="size-3" /> {number.format(u.repeatViewers)}
                        </>
                      ) : null}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      {openId !== null ? (
        <PostViewerLoader postId={openId} onClose={() => setOpenId(null)} />
      ) : null}
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Eye;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-bg-elevated/70 p-4">
      <dt className="flex items-center gap-1.5 text-xs text-fg-muted">
        <Icon className="size-3.5" /> {label}
      </dt>
      <dd className="mt-1 font-display text-3xl tabular-nums">{number.format(value)}</dd>
      {hint ? <p className="mt-0.5 text-[11px] text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

function Thumb({ upload: u, className }: { upload: MyUpload; className?: string }) {
  return (
    <span className={cn("relative block shrink-0 overflow-hidden bg-bg-subtle", className)}>
      <img src={u.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
      {u.isVideo ? (
        <span className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-black/60 text-white">
          <Play className="size-3" />
        </span>
      ) : null}
      {u.nsfw ? (
        <span className="absolute top-1 left-1 rounded bg-black/60 px-1 text-[10px] font-semibold text-white">
          18+
        </span>
      ) : null}
    </span>
  );
}
