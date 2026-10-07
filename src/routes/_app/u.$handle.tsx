import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getProfileByHandle, listProfilePosts } from "@/lib/vela/server";
import { ProfileNotFound, ProfileSkeleton, ProfileView } from "@/components/profile-view";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/u/$handle")({ component: PublicProfile });

function PublicProfile() {
  const { handle: rawHandle } = Route.useParams();
  // Links and typed URLs may carry "@" or capitals; handles are stored lower-case.
  const handle = rawHandle.replace(/^@/, "").trim().toLowerCase();
  const profile = useQuery({
    queryKey: ["profile", handle],
    queryFn: () => getProfileByHandle({ data: { handle } }),
  });
  const posts = useQuery({
    queryKey: ["profile-posts", handle],
    queryFn: () => listProfilePosts({ data: { handle } }),
  });

  if (profile.isPending) return <ProfileSkeleton />;

  if (profile.isError) {
    return (
      <div className="grid min-h-[60dvh] place-items-center px-6 text-center">
        <div>
          <h1 className="font-display text-2xl">Profil lädt nicht</h1>
          <p className="mt-2 text-sm text-fg-muted">Da ist etwas schiefgelaufen.</p>
          <Button
            variant="secondary"
            className="mt-5 rounded-full px-5"
            onClick={() => void profile.refetch()}
          >
            Nochmal versuchen
          </Button>
        </div>
      </div>
    );
  }

  if (!profile.data) return <ProfileNotFound handle={handle} />;

  // Keyed by user so follow state never carries over between profiles.
  return (
    <ProfileView
      key={profile.data.userId}
      profile={profile.data}
      posts={posts.data ?? []}
      postsLoading={posts.isPending}
    />
  );
}
