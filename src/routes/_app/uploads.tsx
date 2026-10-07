/**
 * "Deine Uploads": your own posts with their numbers — headline tiles, the
 * five most-viewed posts as a bar ranking, then every upload as a grid with
 * search, filter and sort. Tap a tile to open it, the pencil to edit/delete.
 */
import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Eye,
  Heart,
  MessageCircle,
  Pencil,
  Play,
  Plus,
  Repeat,
  Search,
  Users,
  X,
} from "lucide-react";
import { listMyUploads, type MyUpload } from "@/lib/vela/server";
import { EditUploadDialog, MY_UPLOADS_KEY } from "@/components/my-uploads";
import { Button } from "@/components/ui/button";
import { PostViewerLoader } from "@/components/post-viewer-loader";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/uploads")({ component: Uploads });

type Sort = "new" | "old" | "views" | "likes" | "comments";
const SORTS: { id: Sort; label: string }[] = [
  { id: "new", label: "Neueste" },
  { id: "old", label: "Älteste" },
  { id: "views", label: "Meiste Aufrufe" },
  { id: "likes", label: "Meiste Likes" },
  { id: "comments", label: "Meiste Kommentare" },
];

type Filter = "all" | "images" | "videos" | "fsk18";

const number = new Intl.NumberFormat("de");
const dayShort = new Intl.DateTimeFormat("de", { day: "numeric", month: "short" });
const dayLong = new Intl.DateTimeFormat("de", { day: "numeric", month: "short", year: "numeric" });

function formatDay(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return (date.getFullYear() === new Date().getFullYear() ? dayShort : dayLong).format(date);
}

function compare(sort: Sort) {
  return (a: MyUpload, b: MyUpload) =>
    sort === "views"
      ? b.views - a.views
      : sort === "likes"
        ? b.likes - a.likes
        : sort === "comments"
          ? b.comments - a.comments
          : sort === "old"
            ? a.createdAt.localeCompare(b.createdAt)
            : b.createdAt.localeCompare(a.createdAt);
}

function Uploads() {
  const query = useQuery({ queryKey: MY_UPLOADS_KEY, queryFn: () => listMyUploads() });
  const [sort, setSort] = useState<Sort>("new");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [editing, setEditing] = useState<MyUpload | null>(null);
  const list = useMemo(() => query.data ?? [], [query.data]);

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
  const avgViews = list.length ? Math.round(totals.views / list.length) : 0;
  const top = [...list]
    .sort((a, b) => b.views - a.views)
    .filter((u) => u.views > 0)
    .slice(0, 5);
  const maxViews = Math.max(1, ...top.map((u) => u.views));

  const counts: Record<Filter, number> = {
    all: list.length,
    images: list.filter((u) => !u.isVideo).length,
    videos: list.filter((u) => u.isVideo).length,
    fsk18: list.filter((u) => u.nsfw).length,
  };
  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "Alle" },
    ...(counts.images && counts.videos
      ? [
          { id: "images" as const, label: "Bilder" },
          { id: "videos" as const, label: "Videos" },
        ]
      : []),
    ...(counts.fsk18 ? [{ id: "fsk18" as const, label: "FSK 18" }] : []),
  ];
  const needle = search.trim().toLowerCase();
  const sorted = list
    .filter((u) =>
      filter === "images"
        ? !u.isVideo
        : filter === "videos"
          ? u.isVideo
          : filter === "fsk18"
            ? u.nsfw
            : true,
    )
    .filter((u) => !needle || u.caption.toLowerCase().includes(needle))
    .sort(compare(sort));

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 pb-24 md:pt-20">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.22em] text-fg-subtle uppercase">Übersicht</p>
          <h1 className="mt-1 font-display text-3xl">Deine Uploads</h1>
        </div>
        <Button asChild size="md">
          <Link to="/upload">
            <Plus className="size-4" /> Hochladen
          </Link>
        </Button>
      </div>

      {query.isPending ? (
        <div className="mt-6 space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 pt-6 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        </div>
      ) : query.isError ? (
        <div className="mt-10 rounded-2xl border border-border p-8 text-center">
          <p className="text-sm text-fg-muted">Deine Uploads konnten nicht geladen werden.</p>
          <Button variant="secondary" className="mt-4" onClick={() => void query.refetch()}>
            Nochmal versuchen
          </Button>
        </div>
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
            <Tile
              icon={Eye}
              label="Aufrufe"
              value={totals.views}
              hint={list.length > 1 ? `Ø ${number.format(avgViews)} pro Beitrag` : undefined}
            />
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
              <ol className="mt-4 space-y-1">
                {top.map((u, i) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(u.id)}
                      title={`${number.format(u.views)} Aufrufe · ${number.format(u.viewers)} Personen · ${number.format(u.likes)} Likes`}
                      aria-label={`Platz ${i + 1}, ${number.format(u.views)} Aufrufe – Beitrag öffnen`}
                      className="flex min-h-12 w-full items-center gap-3 rounded-xl p-1 text-left transition-colors hover:bg-bg-subtle/60"
                    >
                      <span className="w-4 text-right text-xs text-fg-subtle tabular-nums">
                        {i + 1}
                      </span>
                      <Thumb upload={u} className="size-10 rounded-md" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-fg-muted">
                          {u.caption || formatDay(u.createdAt)}
                        </span>
                        <span className="mt-1 flex items-center gap-2">
                          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-bg-subtle">
                            <span
                              className="block h-full rounded-full bg-accent transition-[width] duration-500 motion-reduce:transition-none"
                              style={{ width: `${Math.max(3, (u.views / maxViews) * 100)}%` }}
                            />
                          </span>
                          <span className="w-10 text-right text-xs font-medium tabular-nums">
                            {number.format(u.views)}
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <section className="mt-10" aria-labelledby="all-posts">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="all-posts" className="font-display text-xl">
                Alle Beiträge
              </h2>
              <label className="flex h-11 items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 text-sm focus-within:border-border-strong">
                <span className="text-fg-muted">Sortieren</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="h-full cursor-pointer bg-transparent pr-1 text-fg focus:outline-none"
                >
                  {SORTS.map((s) => (
                    <option key={s.id} value={s.id} className="bg-bg-elevated text-fg">
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="In deinen Captions suchen"
                  aria-label="In deinen Captions suchen"
                  className="h-11 w-full rounded-lg border border-border bg-bg-elevated pr-11 pl-9 text-sm placeholder:text-fg-subtle focus:border-border-strong focus:outline-none [&::-webkit-search-cancel-button]:hidden"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Suche leeren"
                    className="absolute top-0 right-0 grid size-11 place-items-center text-fg-muted hover:text-fg"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
              {filters.length > 1 ? (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter">
                  {filters.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={filter === f.id}
                      onClick={() => setFilter(f.id)}
                      className={cn(
                        "h-11 rounded-full border px-3.5 text-sm transition-colors",
                        filter === f.id
                          ? "border-accent bg-accent text-accent-fg"
                          : "border-border text-fg-muted hover:text-fg",
                      )}
                    >
                      {f.label}{" "}
                      <span className="text-xs tabular-nums opacity-70">{counts[f.id]}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {sorted.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center">
                <p className="text-sm text-fg-muted">Nichts gefunden.</p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                  }}
                >
                  Filter zurücksetzen
                </Button>
              </div>
            ) : (
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {sorted.map((u) => (
                  <li
                    key={u.id}
                    className="group relative overflow-hidden rounded-xl border border-border bg-bg-elevated/40"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenId(u.id)}
                      aria-label={u.caption ? `Beitrag öffnen: ${u.caption}` : "Beitrag öffnen"}
                      className="relative block aspect-square w-full"
                    >
                      <Thumb upload={u} className="h-full w-full" />
                      <span className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-linear-to-t from-black/80 to-transparent px-2.5 pt-6 pb-2 text-xs text-white">
                        <span className="flex items-center gap-1 tabular-nums">
                          <Eye className="size-3.5" /> {number.format(u.views)}
                        </span>
                        <span className="flex items-center gap-1 tabular-nums">
                          <Heart className="size-3.5" /> {number.format(u.likes)}
                        </span>
                        <span className="flex items-center gap-1 tabular-nums">
                          <MessageCircle className="size-3.5" /> {number.format(u.comments)}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(u)}
                      aria-label="Bearbeiten oder löschen"
                      className="absolute top-0 right-0 grid size-11 place-items-center text-white"
                    >
                      <span className="grid size-8 place-items-center rounded-full bg-black/60 backdrop-blur-sm transition-colors group-hover:bg-black/80">
                        <Pencil className="size-3.5" />
                      </span>
                    </button>
                    <div className="px-2.5 py-2">
                      <p className="truncate text-xs">
                        {u.caption || <span className="text-fg-subtle">Ohne Text</span>}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-fg-subtle">
                        {formatDay(u.createdAt)} · {number.format(u.viewers)}{" "}
                        {u.viewers === 1 ? "Person" : "Personen"}
                        {u.repeatViewers ? (
                          <>
                            {" "}
                            · <Repeat className="size-3" aria-label="kamen wieder" />{" "}
                            {number.format(u.repeatViewers)}
                          </>
                        ) : null}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {editing ? (
        <EditUploadDialog
          upload={editing}
          onClose={() => setEditing(null)}
          onOpenPost={() => {
            setOpenId(editing.id);
            setEditing(null);
          }}
        />
      ) : null}
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
      {u.nsfw ? (
        <span className="absolute top-1 left-1 rounded bg-black/60 px-1 text-[10px] font-semibold text-white">
          18+
        </span>
      ) : null}
      {u.isVideo ? (
        <span
          className={cn(
            "absolute left-1 grid size-5 place-items-center rounded-full bg-black/60 text-white",
            u.nsfw ? "top-6" : "top-1",
          )}
        >
          <Play className="size-3" />
        </span>
      ) : null}
    </span>
  );
}
