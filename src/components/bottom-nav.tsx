import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, House, Plus, UserRound } from "lucide-react";
import { useAppSession } from "@/lib/vela/app-session";
import { cn } from "@/lib/utils";
import { LegalLinks } from "@/components/legal-page";

const ITEMS = [
  { to: "/", label: "Für dich", icon: House },
  { to: "/explore", label: "Gallery", icon: Compass },
  { to: "/upload", label: "Hochladen", icon: Plus },
  { to: "/profile", label: "Profil", icon: UserRound },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/90 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {ITEMS.map((item) => {
          const active =
            item.to === "/"
              ? pathname === "/"
              : pathname === item.to || pathname.startsWith(`${item.to}/`);
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                aria-label={item.label}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-1 text-[11px]",
                  active ? "text-fg" : "text-fg-subtle",
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.2 : 1.7} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SideNav({ hasProfile }: { hasProfile: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { userId } = useAppSession();
  return (
    <aside className="hidden w-56 shrink-0 flex-col justify-between border-r border-border px-4 py-8 md:flex">
      <div>
        <Link to="/" className="font-display px-2 text-2xl tracking-tight">
          VELA
        </Link>
        <p className="mt-1 px-2 text-[11px] tracking-[0.22em] text-fg-subtle uppercase">
          18+ Gallery
        </p>
        <nav className="mt-10 flex flex-col gap-1">
          {ITEMS.map((item) => {
            const active =
              item.to === "/"
                ? pathname === "/"
                : pathname === item.to || pathname.startsWith(`${item.to}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-lg px-3 text-sm",
                  active ? "bg-bg-subtle text-fg" : "text-fg-muted hover:bg-bg-subtle/60",
                )}
              >
                <Icon className="size-4" strokeWidth={active ? 2.2 : 1.7} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex flex-col gap-4">
        {hasProfile ? (
          <Link
            to="/settings"
            className="rounded-lg px-3 py-2 text-sm text-fg-muted hover:bg-bg-subtle"
          >
            Einstellungen
          </Link>
        ) : (
          <Link
            to={userId ? "/profile" : "/login"}
            className="rounded-lg bg-accent px-3 py-2 text-center text-sm font-medium text-accent-fg"
          >
            {userId ? "Profil anlegen" : "Eintreten"}
          </Link>
        )}
        <LegalLinks className="justify-start px-3" />
      </div>
    </aside>
  );
}
