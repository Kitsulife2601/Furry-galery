import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getMyProfile, listProfilePosts } from "@/lib/vela/server";
import { ProfileSkeleton, ProfileView } from "@/components/profile-view";

export const Route = createFileRoute("/_app/profile")({ component: MyProfile });

function MyProfile() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMyProfile() });
  const handle = me.data?.handle;
  const posts = useQuery({
    queryKey: ["profile-posts", handle],
    queryFn: () => listProfilePosts({ data: { handle: handle! } }),
    enabled: Boolean(handle),
  });

  if (!me.data) return <ProfileSkeleton />;

  return (
    <ProfileView
      key={me.data.userId}
      profile={me.data}
      posts={posts.data ?? []}
      postsLoading={posts.isPending}
    />
  );
}
