import { Link, createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useAppSession } from "@/lib/vela/app-session";
import { AdminSections } from "@/components/admin-panel";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/admin")({
  head: () => ({ meta: [{ title: "Moderation · Furry Gallery" }] }),
  component: Admin,
});

function Admin() {
  const { profile } = useAppSession();
  if (!profile?.isAdmin) {
    return (
      <div className="grid min-h-[60dvh] place-items-center px-6 text-center">
        <div>
          <ShieldAlert className="mx-auto size-8 text-fg-subtle" aria-hidden />
          <p className="mt-3 font-display text-xl">Nur für das Team</p>
          <p className="mt-1 text-sm text-fg-muted">Diese Seite ist nur für Admins.</p>
          <Button asChild variant="secondary" className="mt-5">
            <Link to="/">Zur Startseite</Link>
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-4xl px-5 py-8 pb-24">
      <p className="text-xs tracking-[0.22em] text-fg-subtle uppercase">Admin</p>
      <h1 className="mt-1 font-display text-3xl">Moderation</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Hallo {profile.displayName}! Hier landet alles, was das Team erledigen muss.
      </p>
      <div className="mt-6">
        <AdminSections />
      </div>
    </div>
  );
}
