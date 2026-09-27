import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import type { Profile } from "@/lib/vela/types";
import { BottomNav, SideNav } from "@/components/bottom-nav";
import { cn } from "@/lib/utils";
import { SiteFooter } from "@/components/legal-page";

export function AppShell({
  profile,
  children,
  fullBleed = false,
}: {
  profile: Profile | null;
  children: ReactNode;
  fullBleed?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hideMobilePad = pathname === "/";

  return (
    <div className="vela-shell" data-bg={profile?.backgroundId ?? "midnight"}>
      <div className="mx-auto flex min-h-dvh max-w-6xl">
        <SideNav hasProfile={Boolean(profile)} />
        <div className="relative min-w-0 flex-1">
          {profile && !fullBleed ? (
            <header className="absolute top-0 right-0 z-30 hidden p-4 md:block">
              <Link
                to="/settings"
                aria-label="Einstellungen"
                className={cn(
                  "grid size-11 place-items-center rounded-lg",
                  pathname === "/settings" ? "text-fg" : "text-fg-muted",
                )}
              >
                <Settings className="size-5" />
              </Link>
            </header>
          ) : null}
          <div
            className={cn(
              hideMobilePad ? "" : "pb-16 md:pb-0",
              fullBleed ? "" : "flex min-h-dvh flex-col",
            )}
          >
            {fullBleed ? children : <div className="flex-1">{children}</div>}
            {fullBleed ? null : <SiteFooter />}
          </div>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
