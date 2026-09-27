import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, Settings } from "lucide-react";
import { toast } from "sonner";
import { useAppSession } from "@/lib/vela/app-session";
import { memberErrorMessage } from "@/lib/vela/errors";
import { toggleFollow } from "@/lib/vela/server";
import { relationshipLabel, type PostCard, type Profile } from "@/lib/vela/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GalleryGrid } from "@/components/gallery-grid";
import { cn } from "@/lib/utils";

export function ProfileView({ profile, posts }: { profile: Profile; posts: PostCard[] }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const session = useAppSession();
  const [following, setFollowing] = useState(profile.isFollowing);
  const [followers, setFollowers] = useState(profile.followerCount);
  const [busy, setBusy] = useState(false);

  async function follow() {
    if (!session.profile) {
      toast.error("Anmelden und Profil anlegen, um zu folgen.");
      void navigate({ to: session.userId ? "/profile" : "/login" });
      return;
    }
    setBusy(true);
    try {
      const result = await toggleFollow({ data: { handle: profile.handle } });
      setFollowing(result.following);
      setFollowers(result.followerCount);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["me"] }),
        queryClient.invalidateQueries({ queryKey: ["profile", profile.handle] }),
      ]);
    } catch (err) {
      toast.error(memberErrorMessage(err, "Folgen fehlgeschlagen."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg pb-8">
      <div
        className={cn(
          "bg-swatch w-full overflow-hidden md:rounded-b-2xl",
          profile.bannerUrl ? "h-40 md:h-48" : "h-20",
        )}
        data-bg={profile.backgroundId}
      >
        {profile.bannerUrl ? (
          <img src={profile.bannerUrl} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="px-5">
        <div className="relative z-10 -mt-14 flex items-end justify-between">
          <div className="size-28 overflow-hidden rounded-full border-4 border-bg bg-bg-subtle shadow-xl ring-2 ring-accent/70">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center font-display text-2xl">
                {profile.displayName.charAt(0)}
              </div>
            )}
          </div>
          {profile.isOwn ? (
            <Button asChild variant="secondary" size="sm">
              <Link to="/settings">
                <Settings className="size-4" />
                Einstellungen
              </Link>
            </Button>
          ) : profile.banned ? null : (
            <Button
              size="sm"
              variant={following ? "secondary" : "primary"}
              onClick={() => void follow()}
              disabled={busy}
            >
              {following ? "Folgst du" : "Folgen"}
            </Button>
          )}
        </div>
        <h1 className="mt-4 font-display text-2xl">{profile.displayName}</h1>
        <p className="text-sm text-fg-muted">@{profile.handle}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge>{profile.age} Jahre</Badge>
          <Badge>{relationshipLabel(profile.relationshipStatus)}</Badge>
        </div>
        {profile.banned ? (
          <div
            role="status"
            className="mt-4 rounded-xl border border-heart/50 bg-heart/10 p-4 text-sm"
          >
            <p className="flex items-center gap-2 font-semibold text-fg">
              <Ban className="size-4 text-heart" />
              {profile.isOwn ? "Dein Konto wurde gesperrt" : "Dieses Konto wurde gesperrt"}
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
        {profile.bio ? <p className="mt-4 text-sm leading-relaxed text-fg">{profile.bio}</p> : null}
        <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
          <div>
            <dt className="text-xs text-fg-subtle">Bilder</dt>
            <dd className="font-medium tabular-nums">{profile.postCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-subtle">Follower</dt>
            <dd className="font-medium tabular-nums">{followers}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-subtle">Folgt</dt>
            <dd className="font-medium tabular-nums">{profile.followingCount}</dd>
          </div>
        </dl>
      </div>
      <div className="mt-8">
        {profile.banned && !profile.isOwn ? null : (
          <GalleryGrid posts={posts} emptyLabel="Noch keine Bilder." />
        )}
      </div>
    </div>
  );
}
