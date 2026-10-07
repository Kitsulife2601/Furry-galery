import { useRef, useState, type ReactNode } from "react";
import { bgStyle } from "@/lib/vela/bg-style";
import { useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  BarChart3,
  CalendarDays,
  Heart,
  ImagePlus,
  Images,
  Share2,
  UserCheck,
  UserPlus,
  UserRoundX,
} from "lucide-react";
import { toast } from "sonner";
import { useAppSession } from "@/lib/vela/app-session";
import { memberErrorMessage } from "@/lib/vela/errors";
import { toggleFollow } from "@/lib/vela/server";
import { listMyLikedPosts } from "@/lib/vela/profile-api";
import { relationshipLabel, type PostCard, type Profile } from "@/lib/vela/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { GalleryGrid } from "@/components/gallery-grid";
import { cn } from "@/lib/utils";
import { FOLLOWING_KEY } from "@/lib/vela/feed-prefs";
import { ProfileMenu } from "@/components/profile-menu";
import { PeopleSheet, type PeopleKind } from "@/components/profile-people";
import { StyledName } from "@/components/styled-name";
import { NamePlate } from "@/components/name-plate";
import { DecoratedAvatar, ProfileEffectLayer } from "@/components/avatar-decoration";
import { formatDay } from "@/lib/vela/durations";

type Tab = "posts" | "liked";

/** 1234 → "1.234", 12345 → "12,3 Tsd." */
function formatCount(n: number): string {
  if (n < 10_000) return n.toLocaleString("de-DE");
  return new Intl.NumberFormat("de-DE", { notation: "compact", maximumFractionDigits: 1 }).format(
    n,
  );
}

function memberSince(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

async function shareProfile(profile: Profile) {
  const url = `${window.location.origin}/u/${profile.handle}`;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  if (coarse && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: `${profile.displayName} (@${profile.handle})`, url });
      return;
    } catch (err) {
      // Closed the share sheet: nothing to do.
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link kopiert", { description: url.replace(/^https?:\/\//, "") });
  } catch {
    toast.error("Kopieren hat nicht geklappt.", { description: url });
  }
}

export function ProfileView({
  profile,
  posts,
  postsLoading = false,
}: {
  profile: Profile;
  posts: PostCard[];
  postsLoading?: boolean;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const session = useAppSession();
  // Result of the last follow tap, until the refetched profile catches up.
  const [override, setOverride] = useState<{ following: boolean; count: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("posts");
  const [people, setPeople] = useState<PeopleKind | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const following = override?.following ?? profile.isFollowing;
  const followers = override?.count ?? profile.followerCount;
  const hidden = profile.banned && !profile.isOwn;
  const since = memberSince(profile.createdAt);

  const liked = useQuery({
    queryKey: ["profile-posts", profile.handle, "liked"],
    queryFn: () => listMyLikedPosts(),
    enabled: profile.isOwn && tab === "liked",
  });

  async function follow() {
    if (!session.profile) {
      toast.error("Anmelden und Profil anlegen, um zu folgen.");
      void navigate({ to: session.userId ? "/profile" : "/login" });
      return;
    }
    setBusy(true);
    try {
      const result = await toggleFollow({ data: { handle: profile.handle } });
      setOverride({ following: result.following, count: result.followerCount });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["me"] }),
        queryClient.invalidateQueries({ queryKey: ["profile", profile.handle] }),
        queryClient.invalidateQueries({ queryKey: ["follow-people", profile.handle] }),
        queryClient.invalidateQueries({ queryKey: FOLLOWING_KEY }),
      ]);
      setOverride(null);
    } catch (err) {
      toast.error(memberErrorMessage(err, "Folgen fehlgeschlagen."));
    } finally {
      setBusy(false);
    }
  }

  function showPosts() {
    setTab("posts");
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="relative mx-auto max-w-lg pb-10">
      {profile.effect ? (
        <ProfileEffectLayer effect={profile.effect} className="inset-x-0 top-0 z-20 h-96" />
      ) : null}
      <div
        className={cn(
          "bg-swatch relative w-full overflow-hidden md:rounded-b-3xl",
          profile.bannerUrl ? "h-44 md:h-52" : "h-36 md:h-44",
        )}
        data-bg={profile.backgroundId}
        style={bgStyle(profile.backgroundId)}
      >
        {profile.bannerUrl ? (
          <img src={profile.bannerUrl} alt="" className="h-full w-full object-cover" />
        ) : null}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-linear-to-t from-bg via-bg/25 to-transparent"
        />
      </div>

      <div className="profile-rise px-5">
        <div className="relative z-10 -mt-14 flex items-end justify-between gap-3">
          <DecoratedAvatar
            src={profile.avatarUrl}
            name={profile.displayName}
            decoration={profile.decoration}
            className="size-28"
            imgClassName={cn(
              "border-4 border-bg shadow-xl",
              profile.decoration ? null : "ring-2 ring-accent/70",
            )}
          />
          <div className="flex items-center gap-2 pb-1">
            {profile.isOwn || profile.banned ? null : (
              <Button
                variant={following ? "secondary" : "primary"}
                className="rounded-full px-5"
                onClick={() => void follow()}
                disabled={busy}
                aria-pressed={following}
              >
                {following ? <UserCheck className="size-4" /> : <UserPlus className="size-4" />}
                {following ? "Folgst du" : "Folgen"}
              </Button>
            )}
            {profile.isOwn ? (
              <Button asChild variant="secondary" className="rounded-full">
                <Link to="/uploads">
                  <BarChart3 className="size-4" /> Statistik
                </Link>
              </Button>
            ) : null}
            {hidden ? null : (
              <button
                type="button"
                onClick={() => void shareProfile(profile)}
                aria-label="Profil teilen"
                title="Profil teilen"
                className="grid size-11 place-items-center rounded-full border border-border bg-bg-elevated text-fg-muted transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none"
              >
                <Share2 className="size-[18px]" />
              </button>
            )}
            {profile.isOwn ? null : (
              <ProfileMenu profile={profile} isAdmin={Boolean(session.profile?.isAdmin)} />
            )}
          </div>
        </div>

        <h1 className="mt-4 font-display text-2xl leading-tight break-words">
          <NamePlate plate={profile.namePlate}>
            <StyledName text={profile.displayName} nameStyle={profile.nameStyle} />
          </NamePlate>
        </h1>
        <p className="mt-0.5 text-sm text-fg-muted">@{profile.handle}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge>{profile.age} Jahre</Badge>
          {profile.relationshipStatus === "private" ? null : (
            <Badge>{relationshipLabel(profile.relationshipStatus)}</Badge>
          )}
          {since ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-fg-subtle">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              Dabei seit {since}
            </span>
          ) : null}
        </div>

        {profile.banned ? (
          <div
            role="status"
            className="mt-4 rounded-2xl border border-heart/50 bg-heart/10 p-4 text-sm"
          >
            <p className="flex items-center gap-2 font-semibold text-fg">
              <Ban className="size-4 text-heart" />
              {profile.isOwn ? "Dein Konto wurde gesperrt" : "Dieses Konto wurde gesperrt"}
            </p>
            <p className="mt-1 text-fg-muted">
              {profile.bannedUntil ? `Bis ${formatDay(profile.bannedUntil)}` : "Dauerhaft"}
            </p>
            <p className="mt-1 text-fg-muted">
              Begründung: {profile.banReason || "Verstoß gegen die Regeln der Community."}
            </p>
            {profile.isOwn ? (
              <p className="mt-2 text-xs text-fg-subtle">
                Fragen? Melde dich beim Team auf unserem Discord-Server.
              </p>
            ) : null}
          </div>
        ) : null}
        {profile.isOwn && profile.deleteAt ? (
          <p
            role="status"
            className="mt-4 rounded-2xl border border-heart/50 bg-heart/10 p-4 text-sm"
          >
            Dein Profil wird am {formatDay(profile.deleteAt)} vom Team gelöscht. Fragen? Melde dich
            auf unserem Discord.
          </p>
        ) : null}
        {session.profile?.isAdmin && !profile.isOwn && profile.deleteAt ? (
          <p className="mt-3 text-xs text-heart">
            Wird am {formatDay(profile.deleteAt)} gelöscht (Team).
          </p>
        ) : null}

        {profile.bio ? (
          <p className="mt-4 text-sm leading-relaxed whitespace-pre-line text-fg break-words">
            {profile.bio}
          </p>
        ) : null}

        <div className="mt-5 grid grid-cols-3 overflow-hidden rounded-2xl border border-border bg-bg-elevated/70">
          <Stat label="Beiträge" value={profile.postCount} onClick={showPosts} disabled={hidden} />
          <Stat
            label="Follower"
            value={followers}
            onClick={() => setPeople("followers")}
            disabled={hidden}
            divider
          />
          <Stat
            label="Folgt"
            value={profile.followingCount}
            onClick={() => setPeople("following")}
            disabled={hidden}
            divider
          />
        </div>
      </div>

      {hidden ? null : (
        <div ref={tabsRef} className="mt-6 scroll-mt-2">
          <div role="tablist" aria-label="Inhalte" className="flex border-b border-border px-5">
            <TabButton active={tab === "posts"} onClick={() => setTab("posts")}>
              <Images className="size-4" /> Beiträge
            </TabButton>
            {profile.isOwn ? (
              <TabButton active={tab === "liked"} onClick={() => setTab("liked")}>
                <Heart className="size-4" /> Gelikt
              </TabButton>
            ) : null}
          </div>
          <div className="pt-3" role="tabpanel">
            {tab === "posts" ? (
              postsLoading ? (
                <GridSkeleton />
              ) : posts.length === 0 ? (
                profile.isOwn ? (
                  <EmptyState
                    icon={<ImagePlus className="size-6" />}
                    title="Noch keine Beiträge"
                    body="Zeig der Community dein erstes Bild oder Video."
                    action={
                      <Button asChild className="mt-5 rounded-full px-5">
                        <Link to="/upload">
                          <ImagePlus className="size-4" /> Hochladen
                        </Link>
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={<Images className="size-6" />}
                    title="Noch nichts geteilt"
                    body={`${profile.displayName} hat noch keine Beiträge.`}
                  />
                )
              ) : (
                <GalleryGrid posts={posts} emptyLabel="Noch keine Beiträge." />
              )
            ) : liked.isPending ? (
              <GridSkeleton />
            ) : liked.isError ? (
              <EmptyState
                icon={<Heart className="size-6" />}
                title="Konnte nicht laden"
                body="Versuch es gleich nochmal."
                action={
                  <Button
                    variant="secondary"
                    className="mt-5 rounded-full"
                    onClick={() => void liked.refetch()}
                  >
                    Nochmal versuchen
                  </Button>
                }
              />
            ) : liked.data.length === 0 ? (
              <EmptyState
                icon={<Heart className="size-6" />}
                title="Noch nichts gelikt"
                body="Bilder, die du likest, landen hier. Nur du siehst diese Liste."
                action={
                  <Button asChild variant="secondary" className="mt-5 rounded-full px-5">
                    <Link to="/explore">Galerie entdecken</Link>
                  </Button>
                }
              />
            ) : (
              <>
                <p className="px-5 pb-2 text-xs text-fg-subtle">Nur du siehst diese Liste.</p>
                <GalleryGrid posts={liked.data} emptyLabel="Noch nichts gelikt." />
              </>
            )}
          </div>
        </div>
      )}

      {people ? (
        <PeopleSheet
          handle={profile.handle}
          displayName={profile.displayName}
          isOwn={profile.isOwn}
          initialKind={people}
          counts={{ followers, following: profile.followingCount }}
          onClose={() => setPeople(null)}
        />
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  onClick,
  disabled,
  divider,
}: {
  label: string;
  value: number;
  onClick: () => void;
  disabled?: boolean;
  divider?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-16 flex-col items-center justify-center gap-0.5 px-2 py-3 transition-colors hover:bg-bg-subtle focus-visible:bg-bg-subtle focus-visible:outline-none disabled:pointer-events-none",
        divider && "border-l border-border",
      )}
    >
      <span className="font-display text-lg leading-none tabular-nums">{formatCount(value)}</span>
      <span className="text-xs text-fg-subtle">{label}</span>
    </button>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "profile-tab relative -mb-px flex h-12 flex-1 items-center justify-center gap-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-inset",
        active ? "text-fg" : "text-fg-muted hover:text-fg",
      )}
      data-active={active || undefined}
    >
      {children}
    </button>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      <span className="grid size-14 place-items-center rounded-full border border-border bg-bg-elevated text-fg-muted">
        {icon}
      </span>
      <p className="mt-4 font-display text-lg">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-fg-muted">{body}</p>
      {action}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div aria-hidden="true" className="grid grid-cols-3 gap-1 px-1 md:gap-1.5 md:px-5">
      {Array.from({ length: 9 }, (_, i) => (
        <Skeleton key={i} className="aspect-3/4 rounded-md md:rounded-lg" />
      ))}
    </div>
  );
}

/** Placeholder in the shape of the profile header while it loads. */
export function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-lg pb-10" aria-busy="true" aria-label="Profil lädt">
      <Skeleton className="h-36 w-full rounded-none md:h-44 md:rounded-b-3xl" />
      <div className="px-5">
        <div className="-mt-14 flex items-end justify-between">
          <div className="size-28 rounded-full border-4 border-bg bg-bg-subtle" />
          <Skeleton className="mb-1 h-11 w-28 rounded-full" />
        </div>
        <Skeleton className="mt-4 h-7 w-44" />
        <Skeleton className="mt-2 h-4 w-24" />
        <div className="mt-3 flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <Skeleton className="mt-5 h-16 w-full rounded-2xl" />
      </div>
      <div className="mt-6">
        <GridSkeleton />
      </div>
    </div>
  );
}

/** No profile under this @handle. */
export function ProfileNotFound({ handle }: { handle: string }) {
  return (
    <div className="grid min-h-[60dvh] place-items-center px-6 text-center">
      <div className="flex flex-col items-center">
        <span className="grid size-16 place-items-center rounded-full border border-border bg-bg-elevated text-fg-muted">
          <UserRoundX className="size-7" />
        </span>
        <h1 className="mt-4 font-display text-2xl">Profil nicht gefunden</h1>
        <p className="mt-2 max-w-xs text-sm break-words text-fg-muted">
          @{handle} gibt es hier nicht (mehr). Vielleicht hat sich der Name geändert?
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild className="rounded-full px-5">
            <Link to="/explore">Zur Galerie</Link>
          </Button>
          <Button asChild variant="secondary" className="rounded-full px-5">
            <Link to="/">Für dich</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
