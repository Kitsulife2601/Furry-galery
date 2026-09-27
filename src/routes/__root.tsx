import { useState } from "react";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth/provider";
import { AdultBoundary } from "@/components/age-gate";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { makeQueryClient } from "@/lib/query";
import appCss from "../styles.css?url";

const APP_NAME = "Furry Gallery";

const fetchSessionUser = createServerFn({ method: "GET" }).handler(async () => {
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const u = await getSessionUser();
  return u ? { id: u.id, email: u.email } : null;
});

export const Route = createRootRoute({
  beforeLoad: async () => ({ sessionUser: await fetchSessionUser() }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content: "Furry Gallery — Furry-Community ab 18. Profile, Uploads, Für-dich-Feed.",
      },
      { name: "theme-color", content: "#0c0b0a" },
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
  return (
    <html lang="de" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-bg text-fg">
        <PreviewHostBridge />
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <AdultBoundary>
              <Outlet />
            </AdultBoundary>
            <Toaster
              theme="dark"
              position="top-center"
              toastOptions={{
                style: {
                  background: "var(--color-bg-elevated)",
                  color: "var(--color-fg)",
                  border: "1px solid var(--color-border)",
                },
              }}
            />
          </QueryClientProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
