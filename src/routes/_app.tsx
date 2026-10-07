import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppGate } from "@/components/app-gate";
import { PostLinkOpener } from "@/components/post-viewer-loader";

export const Route = createFileRoute("/_app")({
  component: () => (
    <AppGate>
      <Outlet />
      <PostLinkOpener />
    </AppGate>
  ),
});
