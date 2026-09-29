import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { AppSessionProvider } from "@/lib/vela/app-session";
import { getMyProfile } from "@/lib/vela/server";
import { AppShell } from "@/components/app-shell";
import { AuthPrompt } from "@/components/auth-prompt";
import { Onboarding } from "@/components/onboarding";
import { Splash } from "@/components/splash";

const PROTECTED = new Set([
  "/upload",
  "/profile",
  "/settings",
  "/admin",
  "/notifications",
  "/feedback",
  "/shop",
]);

function promptCopy(pathname: string) {
  if (pathname === "/upload") {
    return {
      title: "Hochladen",
      body: "Melde dich an und lege ein Profil an, um Bilder zu teilen. Profile ab 15, FSK 18 erst ab 18.",
    };
  }
  if (pathname === "/feedback") {
    return {
      title: "Feedback & Wünsche",
      body: "Melde dich an, damit das Team dir antworten kann.",
    };
  }
  if (pathname === "/shop") {
    return {
      title: "Shop",
      body: "Für jede Minute hier bekommst du Pfoten und kaufst damit Hintergründe, Rahmen und Effekte. Dafür brauchst du ein Konto.",
    };
  }
  if (pathname === "/notifications") {
    return {
      title: "Mitteilungen",
      body: "Likes, Kommentare, neue Follower und Nachrichten vom System. Dafür brauchst du ein Konto.",
    };
  }
  if (pathname === "/settings") {
    return {
      title: "Einstellungen",
      body: "Hintergrund, Bio und Beziehung speicherst du in deinem Profil. Dafür brauchst du ein Konto.",
    };
  }
  return {
    title: "Dein Profil",
    body: "Name, Alter, Beziehung. Melde dich an — Profile gibt es ab 15 Jahren.",
  };
}

export function AppGate({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const profileQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => getMyProfile(),
    enabled: Boolean(user),
  });

  if (isPending) return <Splash />;
  if (user && profileQuery.isPending) return <Splash />;
  if (user && profileQuery.isError) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg px-6 text-center text-fg">
        <p className="text-sm text-fg-muted">
          Profil konnte nicht geladen werden. Bitte neu laden.
        </p>
      </div>
    );
  }

  const profile = user ? (profileQuery.data ?? null) : null;
  const needsMember = PROTECTED.has(pathname);

  if (needsMember && !user) {
    const copy = promptCopy(pathname);
    return (
      <AppSessionProvider userId={null} profile={null}>
        <AppShell profile={null}>
          <AuthPrompt title={copy.title} body={copy.body} />
        </AppShell>
      </AppSessionProvider>
    );
  }

  if (needsMember && !profile) {
    return <Onboarding />;
  }

  return (
    <AppSessionProvider userId={user?.id ?? null} profile={profile}>
      <AppShell profile={profile} fullBleed={pathname === "/"}>
        {children}
      </AppShell>
    </AppSessionProvider>
  );
}
