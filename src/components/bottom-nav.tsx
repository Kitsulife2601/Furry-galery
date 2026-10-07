import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, Compass, House, Plus, ShoppingBag, UserRound } from "lucide-react";
import { useAppSession } from "@/lib/vela/app-session";
import { unreadNotificationCount } from "@/lib/vela/server";
import { cn } from "@/lib/utils";
import { LogoWordmark } from "@/components/logo";

const ITEMS = [
  { to: "/", label: "Für dich", icon: House },
  { to: "/explore", label: "Gallery", icon: Compass },
  { to: "/upload", label: "Hochladen", icon: Plus },
  { to: "/notifications", label: "Mitteilungen", icon: Bell },
  { to: "/profile", label: "Profil", icon: UserRound },
] as const;

/** The side nav (desktop) also links the shop; on phones it sits top right. */
const SIDE_ITEMS = [...ITEMS, { to: "/shop", label: "Shop", icon: ShoppingBag }] as const;

function isActive(pathname: string, to: string): boolean {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
}

/** Unread notifications for the signed-in member (polled once a minute). */
function useUnreadCount(): number {
  const { profile } = useAppSession();
  const query = useQuery({
    queryKey: ["notif-count"],
    queryFn: () => unreadNotificationCount(),
    enabled: Boolean(profile),
    refetchInterval: 60_000,
  });
  return profile ? (query.data ?? 0) : 0;
}

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className="unread-badge absolute -top-1.5 -right-2 grid h-4 min-w-4 place-items-center rounded-full bg-heart px-1 text-[10px] leading-none font-semibold text-white tabular-nums"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function linkLabel(label: string, to: string, unread: number): string {
  if (to !== "/notifications" || unread <= 0) return label;
  return `${label}, ${unread} ungelesen`;
}

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const unread = useUnreadCount();

  return (
    <nav
      aria-label="Hauptnavigation"
      className="glass-bar fixed inset-x-0 bottom-0 z-40 border-t md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {ITEMS.map((item) => {
          const active = isActive(pathname, item.to);
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                aria-label={linkLabel(item.label, item.to, unread)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "nav-tap flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors duration-300 focus-visible:-outline-offset-4",
                  active ? "text-fg" : "text-fg-subtle hover:text-fg-muted",
                )}
              >
                <span className="relative" aria-hidden="true">
                  <Icon
                    className={cn("nav-icon size-5", active && "scale-110")}
                    strokeWidth={active ? 2.2 : 1.7}
                  />
                  {item.to === "/notifications" ? <UnreadBadge count={unread} /> : null}
                </span>
                {item.label}
                <span className={cn("nav-dot h-0.5 w-3 rounded-full bg-accent", active && "nav-dot-on")} />
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
  const unread = useUnreadCount();
  return (
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col justify-between border-r border-border px-4 py-8 md:flex">
      <div>
        <Link to="/" aria-label="Furry Gallery, Startseite" className="block">
          <LogoWordmark compact />
        </Link>
        <nav aria-label="Hauptnavigation" className="mt-10 flex flex-col gap-1">
          {SIDE_ITEMS.map((item) => {
            const active = isActive(pathname, item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                aria-label={unread > 0 && item.to === "/notifications" ? linkLabel(item.label, item.to, unread) : undefined}
                className={cn(
                  "side-link flex h-11 items-center gap-3 rounded-xl px-3 text-sm transition-[background-color,color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  active
                    ? "bg-bg-subtle font-medium text-fg"
                    : "text-fg-muted hover:bg-bg-subtle/70 hover:text-fg",
                )}
              >
                <span className="relative" aria-hidden="true">
                  <Icon
                    className={cn("nav-icon size-4", active && "scale-110")}
                    strokeWidth={active ? 2.2 : 1.7}
                  />
                  {item.to === "/notifications" ? <UnreadBadge count={unread} /> : null}
                </span>
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
            aria-current={isActive(pathname, "/settings") ? "page" : undefined}
            className={cn(
              "flex h-11 items-center rounded-xl px-3 text-sm transition-colors duration-200 hover:bg-bg-subtle hover:text-fg",
              isActive(pathname, "/settings") ? "bg-bg-subtle text-fg" : "text-fg-muted",
            )}
          >
            Einstellungen
          </Link>
        ) : (
          <Link
            to={userId ? "/profile" : "/login"}
            className="flex h-11 items-center justify-center rounded-xl bg-accent px-3 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
          >
            {userId ? "Profil anlegen" : "Eintreten"}
          </Link>
        )}
      </div>
    </aside>
  );
}
