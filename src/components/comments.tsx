import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { CornerDownRight, Heart, MessageCircle, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useAppSession } from "@/lib/vela/app-session";
import { memberErrorMessage } from "@/lib/vela/errors";
import { fullDateTime, relativeTime } from "@/lib/vela/relative-time";
import { addComment, deleteComment, listComments, toggleCommentLike } from "@/lib/vela/server";
import type { PostCard } from "@/lib/vela/types";
import { RichText } from "@/components/caption";
import { cn } from "@/lib/utils";

type CommentList = Awaited<ReturnType<typeof listComments>>;
type CommentData = CommentList["comments"][number];

/** Same limit as the server (addComment). */
const MAX_LENGTH = 300;
/** Replies shown before "x weitere Antworten". */
const REPLIES_PREVIEW = 2;
const POST_LIST_KEYS = new Set(["feed", "explore", "profile-posts"]);

/** Keep the comment counter on feed/grid cards right without refetching (and reshuffling) the feed. */
function bumpCommentCount(queryClient: QueryClient, postId: number, delta: number) {
  const bump = (p: PostCard) =>
    p.id === postId ? { ...p, commentCount: Math.max(0, p.commentCount + delta) } : p;
  queryClient.setQueriesData<PostCard[]>(
    { predicate: (q) => POST_LIST_KEYS.has(String(q.queryKey[0])) },
    (old) => (Array.isArray(old) ? old.map(bump) : old),
  );
  queryClient.setQueryData<PostCard | null>(["post", postId], (old) => (old ? bump(old) : old));
}

export function Comments({
  post,
  onNavigate,
  inputRef: outerInputRef,
  className,
}: {
  post: PostCard;
  /** Called when a link (profile, hashtag) is followed, e.g. to close the viewer. */
  onNavigate?: () => void;
  /** Lets the viewer focus the composer (comment button). */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  className?: string;
}) {
  const { profile, userId } = useAppSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [replyTo, setReplyTo] = useState<CommentData | null>(null);
  const [pending, setPending] = useState<Set<number>>(() => new Set());
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [scrollTo, setScrollTo] = useState<number | null>(null);
  const ownInputRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = outerInputRef ?? ownInputRef;
  const listRef = useRef<HTMLUListElement>(null);
  const queryKey = ["comments", post.id];
  const query = useQuery({
    queryKey,
    queryFn: () => listComments({ data: { postId: post.id } }),
  });

  // Grow the composer with its text (up to ~5 lines).
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [body, inputRef]);

  useEffect(() => {
    if (scrollTo === null) return;
    listRef.current
      ?.querySelector(`[data-comment-id="${scrollTo}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setScrollTo(null);
  }, [scrollTo]);

  function setComments(update: (list: CommentData[]) => CommentData[]) {
    queryClient.setQueryData<CommentList>(queryKey, (old) =>
      old && !old.locked ? { ...old, comments: update(old.comments) } : old,
    );
  }

  function needMember(action: string): boolean {
    if (profile) return false;
    toast.error(`Anmelden und Profil anlegen, um zu ${action}.`);
    onNavigate?.();
    void navigate({ to: userId ? "/profile" : "/login" });
    return true;
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (needMember("kommentieren")) return;
    const text = body.trim();
    if (!text || busy || !profile) return;
    const target = replyTo;
    const tempId = -Date.now();
    const temp: CommentData = {
      id: tempId,
      parentId: target ? (target.parentId ?? target.id) : null,
      likeCount: 0,
      liked: false,
      isOwn: true,
      body: text,
      createdAt: new Date().toISOString(),
      canDelete: false,
      author: {
        displayName: profile.displayName,
        handle: profile.handle,
        avatarUrl: profile.avatarUrl,
      },
    };
    // Show it at once; the refetch then swaps in the real comment.
    setBusy(true);
    setComments((list) => [...list, temp]);
    setPending((s) => new Set(s).add(tempId));
    if (temp.parentId !== null) setExpanded((s) => new Set(s).add(temp.parentId!));
    setScrollTo(tempId);
    setBody("");
    setReplyTo(null);
    try {
      await addComment({ data: { postId: post.id, body: text, replyTo: target?.id } });
      bumpCommentCount(queryClient, post.id, 1);
      await queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      setComments((list) => list.filter((c) => c.id !== tempId));
      setBody((b) => b || text);
      setReplyTo(target);
      toast.error(memberErrorMessage(err, "Kommentar fehlgeschlagen."));
    } finally {
      setPending((s) => {
        const next = new Set(s);
        next.delete(tempId);
        return next;
      });
      setBusy(false);
    }
  }

  async function remove(c: CommentData) {
    const before = queryClient.getQueryData<CommentList>(queryKey);
    const replies = (before?.comments ?? []).filter((x) => x.parentId === c.id).length;
    const ask = replies
      ? `Kommentar samt ${replies === 1 ? "einer Antwort" : `${replies} Antworten`} löschen?`
      : "Kommentar löschen?";
    if (!window.confirm(ask)) return;
    setComments((list) => list.filter((x) => x.id !== c.id && x.parentId !== c.id));
    if (replyTo && (replyTo.id === c.id || replyTo.parentId === c.id)) setReplyTo(null);
    try {
      await deleteComment({ data: { id: c.id } });
      bumpCommentCount(queryClient, post.id, -(1 + replies));
      void queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      if (before) queryClient.setQueryData(queryKey, before);
      toast.error(memberErrorMessage(err, "Löschen fehlgeschlagen."));
    }
  }

  async function like(c: CommentData) {
    if (needMember("liken") || c.id < 0) return;
    // Show it at once; the server's answer then sets the real count.
    const patchOne = (liked: boolean, likeCount: number) =>
      setComments((list) => list.map((x) => (x.id === c.id ? { ...x, liked, likeCount } : x)));
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
    const mention = `@${c.author.handle} `;
    setReplyTo(c);
    setBody((b) => (b.startsWith(mention) ? b : `${mention}${b.replace(/^@[a-z0-9_]+ /i, "")}`));
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus({ preventScroll: false });
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  function cancelReply() {
    if (replyTo) setBody((b) => b.replace(`@${replyTo.author.handle} `, ""));
    setReplyTo(null);
    inputRef.current?.focus();
  }

  function onComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter makes a new line (not while an IME is composing).
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    } else if (e.key === "Escape" && replyTo) {
      e.preventDefault();
      cancelReply();
    }
  }

  if (post.locked || query.data?.locked) return null;
  const comments = query.data?.comments ?? [];
  const top = comments.filter((c) => c.parentId === null);
  const repliesOf = (id: number) => comments.filter((c) => c.parentId === id);
  const left = MAX_LENGTH - body.length;

  const row = (c: CommentData, reply = false) => {
    const isPending = pending.has(c.id);
    const isAuthor = c.author.handle === post.author.handle;
    return (
      <div
        data-comment-id={c.id}
        className={cn("comment-row flex gap-2.5", isPending && "opacity-60")}
      >
        <Link
          to="/u/$handle"
          params={{ handle: c.author.handle }}
          onClick={onNavigate}
          className={cn(
            "mt-0.5 shrink-0 overflow-hidden rounded-full bg-bg-subtle",
            reply ? "size-7" : "size-9",
          )}
          aria-label={`Profil von @${c.author.handle}`}
        >
          {c.author.avatarUrl ? (
            <img
              src={c.author.avatarUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="grid h-full w-full place-items-center text-xs font-medium text-fg-muted">
              {c.author.displayName.charAt(0).toUpperCase()}
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-xs">
            <Link
              to="/u/$handle"
              params={{ handle: c.author.handle }}
              onClick={onNavigate}
              className="truncate font-medium text-fg hover:underline"
            >
              @{c.author.handle}
            </Link>
            {isAuthor ? (
              <span className="rounded-full bg-bg-subtle px-1.5 py-px text-[10px] font-medium text-fg-muted">
                Ersteller
              </span>
            ) : null}
            <time
              dateTime={c.createdAt}
              title={fullDateTime(c.createdAt)}
              className="text-fg-subtle"
            >
              {isPending ? "wird gesendet…" : relativeTime(c.createdAt)}
            </time>
          </div>
          <RichText text={c.body} className="mt-0.5 text-fg" onNavigate={onNavigate} />
          {isPending ? null : (
            <div className="-ml-2 flex items-center">
              <button
                type="button"
                onClick={() => answer(c)}
                className="min-h-9 rounded-md px-2 text-xs font-medium text-fg-subtle hover:text-fg"
              >
                Antworten
              </button>
              {c.canDelete ? (
                <button
                  type="button"
                  onClick={() => void remove(c)}
                  className="grid min-h-9 min-w-9 place-items-center rounded-md text-fg-subtle hover:text-heart"
                  aria-label="Kommentar löschen"
                  title="Löschen"
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </div>
          )}
        </div>
        <div className="flex w-9 shrink-0 flex-col items-center">
          <button
            type="button"
            onClick={() => void like(c)}
            disabled={isPending}
            aria-pressed={c.liked}
            aria-label={c.liked ? "Like entfernen" : "Kommentar liken"}
            className="grid size-9 place-items-center rounded-full text-fg-subtle hover:text-heart disabled:opacity-40"
          >
            <Heart className={cn("size-4", c.liked && "comment-heart-on fill-heart text-heart")} />
          </button>
          {c.likeCount > 0 ? (
            <span className="-mt-1.5 text-[11px] text-fg-subtle tabular-nums">{c.likeCount}</span>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <section
      className={cn("flex flex-col", className)}
      aria-label="Kommentare"
      aria-busy={query.isPending}
    >
      <div className="flex-1 px-4 pt-3 pb-2">
        <h3 className="text-xs font-medium tracking-wide text-fg-subtle uppercase">
          Kommentare{" "}
          {comments.length ? <span className="tabular-nums">({comments.length})</span> : ""}
        </h3>
        {query.isPending ? (
          <ul className="mt-4 space-y-4" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex gap-2.5">
                <span className="viewer-skeleton size-9 shrink-0 rounded-full" />
                <span className="flex-1 space-y-2 pt-1">
                  <span className="viewer-skeleton block h-2.5 w-24 rounded" />
                  <span className="viewer-skeleton block h-2.5 w-4/5 rounded" />
                </span>
              </li>
            ))}
          </ul>
        ) : query.isError ? (
          <div className="mt-4 rounded-xl bg-bg-subtle px-4 py-5 text-center text-sm text-fg-muted">
            Kommentare konnten nicht geladen werden.
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="mt-2 block w-full min-h-11 font-medium text-fg underline-offset-4 hover:underline"
            >
              Nochmal versuchen
            </button>
          </div>
        ) : comments.length === 0 ? (
          <div className="mt-4 flex flex-col items-center rounded-2xl border border-dashed border-border px-4 py-7 text-center">
            <MessageCircle className="size-6 text-fg-subtle" strokeWidth={1.6} />
            <p className="mt-2 text-sm font-medium text-fg">Noch keine Kommentare</p>
            <p className="mt-0.5 text-xs text-fg-muted">Schreib den ersten — sag was Nettes!</p>
          </div>
        ) : (
          <ul ref={listRef} className="mt-3 space-y-4">
            {top.map((c) => {
              const replies = repliesOf(c.id);
              const open = expanded.has(c.id) || replies.length <= REPLIES_PREVIEW + 1;
              const shown = open ? replies : replies.slice(0, REPLIES_PREVIEW);
              const hidden = replies.length - shown.length;
              return (
                <li key={c.id}>
                  {row(c)}
                  {replies.length ? (
                    <ul className="mt-2 ml-[2.875rem] space-y-3">
                      {shown.map((r) => (
                        <li key={r.id}>{row(r, true)}</li>
                      ))}
                      {hidden > 0 ? (
                        <li>
                          <button
                            type="button"
                            onClick={() => setExpanded((s) => new Set(s).add(c.id))}
                            className="flex min-h-9 items-center gap-2 text-xs font-medium text-fg-muted hover:text-fg"
                          >
                            <CornerDownRight className="size-3.5" />
                            {hidden === 1 ? "1 weitere Antwort" : `${hidden} weitere Antworten`}
                          </button>
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <form
        onSubmit={(e) => void submit(e)}
        className="sticky bottom-0 z-10 border-t border-border bg-bg-elevated px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        {replyTo ? (
          <div className="mb-2 flex items-center justify-between rounded-lg bg-bg-subtle py-0.5 pr-0.5 pl-3 text-xs text-fg-muted">
            <span className="truncate">
              Antwort an <span className="font-medium text-fg">@{replyTo.author.handle}</span>
            </span>
            <button
              type="button"
              onClick={cancelReply}
              aria-label="Antwort abbrechen"
              className="grid size-9 place-items-center rounded-md hover:text-fg"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}
        {profile ? (
          <div className="flex items-end gap-2">
            <div className="relative min-w-0 flex-1">
              <textarea
                ref={inputRef}
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, MAX_LENGTH))}
                onKeyDown={onComposerKey}
                rows={1}
                maxLength={MAX_LENGTH}
                enterKeyHint="send"
                placeholder={replyTo ? "Antwort schreiben…" : "Kommentar schreiben…"}
                aria-label={replyTo ? "Antwort" : "Kommentar"}
                aria-describedby={left <= 60 ? `comment-left-${post.id}` : undefined}
                className="block min-h-11 w-full resize-none rounded-2xl border border-border bg-bg px-3.5 py-[0.6875rem] text-sm leading-snug text-fg placeholder:text-fg-subtle focus:border-fg-subtle focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={busy || !body.trim()}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-fg transition-opacity disabled:opacity-40"
              aria-label="Senden"
            >
              <Send className="size-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => needMember("kommentieren")}
            className="flex min-h-11 w-full items-center justify-center rounded-2xl border border-border bg-bg px-4 text-sm text-fg-muted hover:text-fg"
          >
            Zum Kommentieren anmelden
          </button>
        )}
        {profile && left <= 60 ? (
          <p
            id={`comment-left-${post.id}`}
            className={cn(
              "mt-1 text-right text-[11px] tabular-nums",
              left <= 10 ? "text-heart" : "text-fg-subtle",
            )}
            aria-live="polite"
          >
            Noch {left} Zeichen
          </p>
        ) : null}
      </form>
    </section>
  );
}
