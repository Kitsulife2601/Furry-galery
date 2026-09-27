import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppGate } from "@/components/app-gate";

export const Route = createFileRoute("/_app")({
  component: () => (
    <AppGate>
      <Outlet />
    </AppGate>
  ),
});
