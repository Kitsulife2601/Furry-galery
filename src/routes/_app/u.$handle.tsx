import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getProfileByHandle, listProfilePosts } from "@/lib/vela/server";
import { ProfileView } from "@/components/profile-view";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_app/u/$handle")({ component: PublicProfile });

function PublicProfile() {
  const { handle } = Route.useParams();
  const profile = useQuery({
    queryKey: ["profile", handle],
    queryFn: () => getProfileByHandle({ data: { handle } }),
  });
  const posts = useQuery({
    queryKey: ["profile-posts", handle],
    queryFn: () => listProfilePosts({ data: { handle } }),
  });

  if (profile.isPending) {
    return (
      <div className="px-5 py-10">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!profile.data) {
    return (
      <div className="grid min-h-[60dvh] place-items-center px-6 text-center">
        <div>
          <h1 className="font-display text-2xl">Nicht gefunden</h1>
          <p className="mt-2 text-sm text-fg-muted">@{handle} gibt es hier nicht.</p>
        </div>
      </div>
    );
  }

  // Keyed by user so follow state never carries over between profiles.
  return <ProfileView key={profile.data.userId} profile={profile.data} posts={posts.data ?? []} />;
}
