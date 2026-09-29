import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useAppSession } from "@/lib/vela/app-session";
import { memberErrorMessage } from "@/lib/vela/errors";
import { addComment, deleteComment, listComments, toggleCommentLike } from "@/lib/vela/server";
import type { PostCard } from "@/lib/vela/types";
import { cn } from "@/lib/utils";

type CommentList = Awaited<ReturnType<typeof listComments>>;
type CommentData = CommentList["comments"][number];

export function Comments({ post }: { post: PostCard }) {
  const { profile, userId } = useAppSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [replyTo, setReplyTo] = useState<CommentData | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryKey = ["comments", post.id];
  const query = useQuery({
    queryKey,
    queryFn: () => listComments({ data: { postId: post.id } }),
  });

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      // Comment counts on feed and grid cards.
      queryClient.invalidateQueries({ queryKey: ["feed"] }),
      queryClient.invalidateQueries({ queryKey: ["explore"] }),
      queryClient.invalidateQueries({ queryKey: ["profile-posts"] }),
    ]);
  }

  function needMember(action: string): boolean {
    if (profile) return false;
    toast.error(`Anmelden und Profil anlegen, um zu ${action}.`);
    void navigate({ to: userId ? "/profile" : "/login" });
    return true;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (needMember("kommentieren")) return;
    if (!body.trim()) return;
    setBusy(true);
    try {
      await addComment({ data: { postId: post.id, body, replyTo: replyTo?.id } });
      setBody("");
      setReplyTo(null);
      await refresh();
    } catch (err) {
      toast.error(memberErrorMessage(err, "Kommentar fehlgeschlagen."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    try {
      await deleteComment({ data: { id } });
      if (replyTo?.id === id) setReplyTo(null);
      await refresh();
    } catch (err) {
      toast.error(memberErrorMessage(err, "Löschen fehlgeschlagen."));
    }
  }

  async function like(c: CommentData) {
    if (needMember("liken")) return;
    // Show it at once; the server's answer then sets the real count.
    const patchOne = (liked: boolean, likeCount: number) =>
      queryClient.setQueryData<CommentList>(queryKey, (old) =>
        old && !old.locked
          ? {
              ...old,
              comments: old.comments.map((x) => (x.id === c.id ? { ...x, liked, likeCount } : x)),
            }
          : old,
      );
    patchOne(!c.liked, c.likeCount + (c.liked ? -1 : 1));
    try {
      const result = await toggleCommentLike({ data: { id: c.id } });
      patchOne(result.liked, result.likeCount);
    } catch (err) {
      patchOne(c.liked, c.likeCount);
      toast.error(memberErrorMessage(err, "Like fehlgeschlagen."));
    }
  }

  function answer(c: CommentData) {
    if (needMember("antworten")) return;
    setReplyTo(c);
    setBody((b) => (b.startsWith(`@${c.author.handle} `) ? b : `@${c.author.handle} ${b}`));
    inputRef.current?.focus();
  }

  if (post.locked || query.data?.locked) return null;
  const comments = query.data?.comments ?? [];
  const top = comments.filter((c) => c.parentId === null);
  const repliesOf = (id: number) => comments.filter((c) => c.parentId === id);

  const row = (c: CommentData, reply = false) => (
    <div className="flex gap-2.5">
      <Link
        to="/u/$handle"
        params={{ handle: c.author.handle }}
        className={cn(
          "shrink-0 overflow-hidden rounded-full bg-bg-subtle",
          reply ? "size-6" : "size-8",
        )}
      >
        {c.author.avatarUrl ? (
          <img src={c.author.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center text-xs">
            {c.author.displayName.charAt(0)}
          </span>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <Link to="/u/$handle" params={{ handle: c.author.handle }} className="text-xs font-medium">
          @{c.author.handle}
        </Link>
        <p className="text-sm leading-snug break-words">{c.body}</p>
        <button
          type="button"
          onClick={() => answer(c)}
          className="-ml-1.5 min-h-8 rounded-md px-1.5 text-xs text-fg-subtle hover:text-fg"
        >
          Antworten
        </button>
      </div>
      <div className="flex shrink-0 flex-col items-center">
        <button
          type="button"
          onClick={() => void like(c)}
          aria-pressed={c.liked}
          aria-label={c.liked ? "Like entfernen" : "Kommentar liken"}
          className="grid size-8 place-items-center rounded-md text-fg-subtle hover:text-heart"
        >
          <Heart className={cn("size-4", c.liked && "fill-heart text-heart")} />
        </button>
        {c.likeCount > 0 ? (
          <span className="-mt-1 text-[11px] text-fg-subtle tabular-nums">{c.likeCount}</span>
        ) : null}
        {c.canDelete ? (
          <button
            type="button"
            onClick={() => void remove(c.id)}
            className="grid size-8 place-items-center rounded-md text-fg-subtle hover:text-heart"
            aria-label="Kommentar löschen"
          >
            <Trash2 className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <section className="border-t border-border px-4 pt-3 pb-4">
      <h3 className="text-xs font-medium tracking-wide text-fg-subtle uppercase">
        Kommentare {comments.length ? `(${comments.length})` : ""}
      </h3>
      {query.isPending ? (
        <p className="mt-3 text-sm text-fg-muted">Lädt…</p>
      ) : comments.length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">Noch keine Kommentare.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {top.map((c) => {
            const replies = repliesOf(c.id);
            return (
              <li key={c.id}>
                {row(c)}
                {replies.length ? (
                  <ul className="mt-1 ml-10 space-y-2 border-l border-border pl-3">
                    {replies.map((r) => (
                      <li key={r.id}>{row(r, true)}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={(e) => void submit(e)} className="mt-4">
        {replyTo ? (
          <div className="mb-2 flex items-center justify-between rounded-lg bg-bg-subtle px-3 py-1.5 text-xs text-fg-muted">
            <span className="truncate">
              Antwort an <span className="text-fg">@{replyTo.author.handle}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setBody((b) => b.replace(`@${replyTo.author.handle} `, ""));
                setReplyTo(null);
              }}
              aria-label="Antwort abbrechen"
              className="grid size-7 place-items-center rounded-md hover:text-fg"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={300}
            placeholder={
              profile
                ? replyTo
                  ? "Antwort schreiben…"
                  : "Kommentar schreiben…"
                : "Zum Kommentieren anmelden"
            }
            aria-label={replyTo ? "Antwort" : "Kommentar"}
            className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 text-sm"
          />
          <button
            type="submit"
            disabled={busy || (Boolean(profile) && !body.trim())}
            className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent text-accent-fg disabled:opacity-40"
            aria-label="Senden"
          >
            <Send className="size-4" />
          </button>
        </div>
      </form>
    </section>
  );
}
