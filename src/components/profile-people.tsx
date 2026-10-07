/** Follower / "Folgt" lists of a profile, as a bottom sheet with follow buttons. */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserCheck, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { useAppSession } from "@/lib/vela/app-session";
import { memberErrorMessage } from "@/lib/vela/errors";
import { toggleFollow } from "@/lib/vela/server";
import { listFollowPeople, type FollowPerson } from "@/lib/vela/profile-api";
import { DecoratedAvatar } from "@/components/avatar-decoration";
import { StyledName } from "@/components/styled-name";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type PeopleKind = "followers" | "following";

const KIND_LABEL: Record<PeopleKind, string> = { followers: "Follower", following: "Folgt" };

export function PeopleSheet({
  handle,
  displayName,
  isOwn,
  initialKind,
  counts,
  onClose,
}: {
  handle: string;
  displayName: string;
  isOwn: boolean;
  initialKind: PeopleKind;
  counts: Record<PeopleKind, number>;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<PeopleKind>(initialKind);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const people = useQuery({
    queryKey: ["follow-people", handle, kind],
    queryFn: () => listFollowPeople({ data: { handle, kind } }),
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  if (typeof document === "undefined") return null;

  const empty =
    kind === "followers"
      ? isOwn
        ? "Noch keine Follower. Teile ein Bild, dann kommen sie bestimmt!"
        : `${displayName} hat noch keine Follower.`
      : isOwn
        ? "Du folgst noch niemandem. Stöber doch mal durch die Galerie."
        : `${displayName} folgt noch niemandem.`;

  return createPortal(
    <div
      className="profile-sheet-backdrop fixed inset-0 z-[60] flex items-end justify-center bg-bg/80 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${KIND_LABEL[kind]} von @${handle}`}
    >
      <div
        className="profile-sheet flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-border bg-bg-elevated text-fg shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-fg/15 sm:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between gap-3 px-5 pt-3">
          <p className="truncate text-sm text-fg-muted">@{handle}</p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-bg-subtle hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none"
            aria-label="Schließen"
          >
            <X className="size-5" />
          </button>
        </div>
        <div role="tablist" aria-label="Liste" className="mx-5 mt-1 grid grid-cols-2 gap-1 rounded-full bg-bg-subtle p-1">
          {(["followers", "following"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "h-10 rounded-full text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none",
                kind === k ? "bg-bg-elevated text-fg shadow-sm" : "text-fg-muted hover:text-fg",
              )}
            >
              {KIND_LABEL[k]} <span className="tabular-nums text-fg-subtle">{counts[k]}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 min-h-48 flex-1 overflow-y-auto overscroll-contain px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {people.isPending ? (
            <ul aria-hidden="true" className="space-y-1 px-3 py-1">
              {Array.from({ length: 5 }, (_, i) => (
                <li key={i} className="flex items-center gap-3 py-2">
                  <Skeleton className="size-11 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </li>
              ))}
            </ul>
          ) : people.isError ? (
            <div className="px-6 py-12 text-center text-sm text-fg-muted">
              <p>Liste konnte nicht geladen werden.</p>
              <Button className="mt-4" variant="secondary" onClick={() => void people.refetch()}>
                Nochmal versuchen
              </Button>
            </div>
          ) : people.data.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-bg-subtle text-fg-muted">
                <Users className="size-5" />
              </span>
              <p className="mt-3 text-sm text-fg-muted">{empty}</p>
            </div>
          ) : (
            <ul className="py-1">
              {people.data.map((person) => (
                <PersonRow key={person.handle} person={person} onOpen={onClose} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PersonRow({ person, onOpen }: { person: FollowPerson; onOpen: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const session = useAppSession();
  const [following, setFollowing] = useState(person.isFollowing);
  const [busy, setBusy] = useState(false);

  async function follow() {
    if (!session.profile) {
      toast.error("Anmelden und Profil anlegen, um zu folgen.");
      onOpen();
      void navigate({ to: session.userId ? "/profile" : "/login" });
      return;
    }
    setBusy(true);
    try {
      const result = await toggleFollow({ data: { handle: person.handle } });
      setFollowing(result.following);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["me"] }),
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
      ]);
    } catch (err) {
      toast.error(memberErrorMessage(err, "Folgen fehlgeschlagen."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center gap-3 rounded-2xl px-3 py-1.5 hover:bg-bg-subtle/60">
      <Link
        to="/u/$handle"
        params={{ handle: person.handle }}
        onClick={onOpen}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none"
      >
        <DecoratedAvatar
          src={person.avatarUrl}
          name={person.displayName}
          decoration={person.decoration}
          className="size-11"
          letterClassName="text-base"
        />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">
            <StyledName text={person.displayName} nameStyle={person.nameStyle} />
          </span>
          <span className="block truncate text-xs text-fg-muted">@{person.handle}</span>
        </span>
      </Link>
      {person.isSelf ? (
        <span className="shrink-0 px-2 text-xs text-fg-subtle">Du</span>
      ) : (
        <Button
          size="sm"
          variant={following ? "secondary" : "primary"}
          className="h-11 shrink-0 rounded-full px-4"
          disabled={busy}
          aria-pressed={following}
          aria-label={following ? `@${person.handle} entfolgen` : `@${person.handle} folgen`}
          onClick={() => void follow()}
        >
          {following ? <UserCheck className="size-4" /> : <UserPlus className="size-4" />}
          {following ? "Folgst du" : "Folgen"}
        </Button>
      )}
    </li>
  );
}
