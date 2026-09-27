import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getMyProfile, listProfilePosts } from "@/lib/vela/server";
import { ProfileView } from "@/components/profile-view";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_app/profile")({ component: MyProfile });

function MyProfile() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMyProfile() });
  const handle = me.data?.handle;
  const posts = useQuery({
    queryKey: ["profile-posts", handle],
    queryFn: () => listProfilePosts({ data: { handle: handle! } }),
    enabled: Boolean(handle),
  });

  if (!me.data) {
    return (
      <div className="px-5 py-10">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="pt-0">
      <ProfileView profile={me.data} posts={posts.data ?? []} />
    </div>
  );
}
