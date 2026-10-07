import { useEffect, useState } from "react";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { makeQueryClient } from "@/lib/query";
import { listenForStaleBuild } from "@/lib/stale-reload";
import appCss from "../styles.css?url";

const APP_NAME = "Furry Gallery";

/** Page titles for routes that don't set their own (`<Seite> · Furry Gallery`). */
const ROUTE_TITLES: Record<string, string> = {
  "/_app/": "Für dich",
  "/_app/explore": "Gallery",
  "/_app/upload": "Hochladen",
  "/_app/uploads": "Deine Uploads",
  "/_app/notifications": "Mitteilungen",
  "/_app/profile": "Dein Profil",
  "/_app/settings": "Einstellungen",
  "/_app/shop": "Shop",
  "/_app/updates": "Neuigkeiten",
  "/_app/feedback": "Feedback & Wünsche",
  "/_app/admin": "Moderation",
  "/login": "Anmelden",
};

function pageTitle(matches: ReadonlyArray<{ routeId: string; params: unknown }>): string {
  const leaf = matches[matches.length - 1];
  if (!leaf) return APP_NAME;
  if (leaf.routeId === "/_app/u/$handle") {
    const handle = (leaf.params as { handle?: string } | undefined)?.handle;
    return handle ? `@${handle} · ${APP_NAME}` : APP_NAME;
  }
  const name = ROUTE_TITLES[leaf.routeId];
  return name ? `${name} · ${APP_NAME}` : APP_NAME;
}

const fetchSessionUser = createServerFn({ method: "GET" }).handler(async () => {
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const u = await getSessionUser();
  return u ? { id: u.id, email: u.email } : null;
});

export const Route = createRootRoute({
  beforeLoad: async () => ({ sessionUser: await fetchSessionUser() }),
  head: ({ matches }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: pageTitle(matches) },
      {
        name: "description",
        content:
          "Furry Gallery — die deutsche Furry-Community: Für-dich-Feed, Gallery, Profile, Uploads und Kommentare.",
      },
      { name: "theme-color", content: "#0c0b0a" },
      { name: "color-scheme", content: "dark" },
      { name: "format-detection", content: "telephone=no" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon.png" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Manrope:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  const [queryClient] = useState(() => makeQueryClient());
  useEffect(() => listenForStaleBuild(), []);
  return (
    <html lang="de" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-bg text-fg">
        <PreviewHostBridge />
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <Outlet />
            <Toaster
              theme="dark"
              position="top-center"
              offset={16}
              mobileOffset={{ top: 56 }}
              containerAriaLabel="Hinweise"
            />
          </QueryClientProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
