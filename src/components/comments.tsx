import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAppSession } from "@/lib/vela/app-session";
import { memberErrorMessage } from "@/lib/vela/errors";
import { addComment, deleteComment, listComments } from "@/lib/vela/server";
import type { PostCard } from "@/lib/vela/types";

export function Comments({ post }: { post: PostCard }) {
  const { profile, userId } = useAppSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["comments", post.id],
    queryFn: () => listComments({ data: { postId: post.id } }),
  });

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["comments", post.id] }),
      // Comment counts on feed and grid cards.
      queryClient.invalidateQueries({ queryKey: ["feed"] }),
      queryClient.invalidateQueries({ queryKey: ["explore"] }),
      queryClient.invalidateQueries({ queryKey: ["profile-posts"] }),
    ]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!profile) {
      toast.error("Anmelden und Profil anlegen, um zu kommentieren.");
      void navigate({ to: userId ? "/profile" : "/login" });
      return;
    }
    if (!body.trim()) return;
    setBusy(true);
    try {
      await addComment({ data: { postId: post.id, body } });
      setBody("");
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
      await refresh();
    } catch (err) {
      toast.error(memberErrorMessage(err, "Löschen fehlgeschlagen."));
    }
  }

  if (post.locked || query.data?.locked) return null;
  const comments = query.data?.comments ?? [];

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
          {comments.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <Link
                to="/u/$handle"
                params={{ handle: c.author.handle }}
                className="size-8 shrink-0 overflow-hidden rounded-full bg-bg-subtle"
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
                <Link
                  to="/u/$handle"
                  params={{ handle: c.author.handle }}
                  className="text-xs font-medium"
                >
                  @{c.author.handle}
                </Link>
                <p className="text-sm leading-snug break-words">{c.body}</p>
              </div>
              {c.canDelete ? (
                <button
                  type="button"
                  onClick={() => void remove(c.id)}
                  className="grid size-8 shrink-0 place-items-center rounded-md text-fg-subtle hover:text-heart"
                  aria-label="Kommentar löschen"
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => void submit(e)} className="mt-4 flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={300}
          placeholder={profile ? "Kommentar schreiben…" : "Zum Kommentieren anmelden"}
          aria-label="Kommentar"
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
      </form>
    </section>
  );
}
