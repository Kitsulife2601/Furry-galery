import { useCallback, useState, type ReactNode } from "react";
import { bgStyle } from "@/lib/vela/bg-style";
import { Link, useRouterState } from "@tanstack/react-router";
import { PawPrint, ShoppingBag } from "lucide-react";
import type { Profile } from "@/lib/vela/types";
import { BottomNav, SideNav } from "@/components/bottom-nav";
import { cn } from "@/lib/utils";
import { SiteFooter } from "@/components/legal-page";
import { PawDialog } from "@/components/admin-panel";
import { InterestsDialog } from "@/components/interests";
import { usePawTicker, usePaws } from "@/lib/vela/use-paws";
import { LogoWordmark } from "@/components/logo";
import { NotificationPopups } from "@/components/notification-popups";

export function AppShell({
  profile,
  children,
  fullBleed = false,
}: {
  profile: Profile | null;
  children: ReactNode;
  fullBleed?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const [interestsDone, setInterestsDone] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hideMobilePad = pathname === "/";
  usePawTicker(Boolean(profile) && !profile?.banned);
  const paws = usePaws();

  return (
    <div className="vela-shell" data-bg={profile?.backgroundId ?? "midnight"} style={bgStyle(profile?.backgroundId ?? "midnight", true)}>
      <div className="mx-auto flex min-h-dvh max-w-6xl">
        <SideNav hasProfile={Boolean(profile)} />
        <div className="relative min-w-0 flex-1">
          {pathname === "/" ? null : (
            <Link
              to="/"
              aria-label="Furry Gallery, Startseite"
              className="absolute top-2 left-3 z-30 md:hidden"
            >
              <LogoWordmark compact />
            </Link>
          )}
          {profile ? (
            <header className="absolute top-0 right-0 z-30 flex items-center gap-1 p-2 md:p-4">
              <Link
                to="/shop"
                aria-label={`Shop, ${paws.data?.paws ?? 0} Pfoten`}
                title="Shop"
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-full border border-border bg-bg/70 px-3 text-sm tabular-nums backdrop-blur-md",
                  pathname === "/shop" ? "text-accent" : "text-fg hover:border-border-strong",
                )}
              >
                <ShoppingBag className="size-4" />
                🐾 {paws.data?.paws ?? profile.paws ?? 0}
              </Link>
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label={profile.isAdmin ? "Einstellungen & Moderation" : "Einstellungen"}
                title={profile.isAdmin ? "Einstellungen & Moderation" : "Einstellungen"}
                className={cn(
                  "grid size-11 place-items-center rounded-lg",
                  menuOpen ? "text-accent" : "text-fg-muted hover:text-fg",
                )}
              >
                <PawPrint className="size-5" />
              </button>
            </header>
          ) : null}
          <div
            className={cn(
              hideMobilePad ? "" : "pb-16 md:pb-0",
              fullBleed ? "" : "flex min-h-dvh flex-col",
              // Room for the logo on phones.
              !fullBleed && pathname !== "/" && "pt-12 md:pt-0",
            )}
          >
            {fullBleed ? children : <div className="flex-1">{children}</div>}
            {fullBleed ? null : <SiteFooter />}
          </div>
        </div>
      </div>
      <NotificationPopups enabled={Boolean(profile) && !profile?.banned} />
      <BottomNav />
      {profile?.needsInterests && !interestsDone ? (
        <InterestsDialog onDone={() => setInterestsDone(true)} />
      ) : null}
      {menuOpen && profile ? <PawDialog isAdmin={profile.isAdmin} onClose={closeMenu} /> : null}
    </div>
  );
}
