import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import { RatingPopup } from "@/components/rating-popup";
import { UpdatesPopup } from "@/components/updates-popup";

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
  const mainRef = useRef<HTMLElement>(null);

  // After navigating with the keyboard via the nav, move focus to the new
  // page so screen readers and Tab continue there (not back in the nav).
  useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest("nav")) {
      mainRef.current?.focus({ preventScroll: true });
    }
  }, [pathname]);

  return (
    <div className="vela-shell" data-bg={profile?.backgroundId ?? "midnight"} style={bgStyle(profile?.backgroundId ?? "midnight", true)}>
      <a href="#main" className="skip-link">
        Zum Inhalt springen
      </a>
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
            <header
              aria-label="Konto"
              className="absolute top-0 right-0 z-30 flex items-center gap-1 p-1.5 md:p-4"
            >
              <Link
                to="/shop"
                aria-label={`Shop, ${paws.data?.paws ?? 0} Pfoten`}
                title="Shop"
                className={cn(
                  "glass-chip flex h-11 items-center gap-1.5 rounded-full border border-border px-3.5 text-sm font-medium tabular-nums hover:border-border-strong",
                  pathname === "/shop" ? "text-accent" : "text-fg",
                )}
              >
                <ShoppingBag className="size-4" />
                🐾 {paws.data?.paws ?? profile.paws ?? 0}
              </Link>
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={menuOpen}
                aria-label={profile.isAdmin ? "Einstellungen & Moderation" : "Einstellungen"}
                title={profile.isAdmin ? "Einstellungen & Moderation" : "Einstellungen"}
                className={cn(
                  "grid size-11 place-items-center rounded-full transition-colors duration-200",
                  menuOpen ? "text-accent" : "text-fg-muted hover:bg-fg/8 hover:text-fg",
                )}
              >
                <PawPrint className="size-5" />
              </button>
            </header>
          ) : null}
          <main
            id="main"
            ref={mainRef}
            tabIndex={-1}
            key={fullBleed ? "feed" : pathname}
            className={cn(
              "outline-none",
              hideMobilePad ? "" : "pb-nav",
              fullBleed ? "" : "page-rise flex min-h-dvh flex-col",
              // Room for the logo on phones.
              !fullBleed && pathname !== "/" && "pt-12 md:pt-0",
            )}
          >
            {fullBleed ? children : <div className="flex-1">{children}</div>}
            {fullBleed ? null : <SiteFooter />}
          </main>
        </div>
      </div>
      <NotificationPopups enabled={Boolean(profile) && !profile?.banned} />
      <UpdatesPopup enabled={Boolean(profile) && !profile?.banned} />
      <RatingPopup enabled={Boolean(profile) && !profile?.banned} />
      <BottomNav />
      {profile?.needsInterests && !interestsDone ? (
        <InterestsDialog onDone={() => setInterestsDone(true)} />
      ) : null}
      {menuOpen && profile ? <PawDialog isAdmin={profile.isAdmin} onClose={closeMenu} /> : null}
    </div>
  );
}
