import { createFileRoute } from "@tanstack/react-router";
import { useAppSession } from "@/lib/vela/app-session";
import { AdminSections } from "@/components/admin-panel";

export const Route = createFileRoute("/_app/admin")({ component: Admin });

function Admin() {
  const { profile } = useAppSession();
  if (!profile?.isAdmin) {
    return (
      <div className="grid min-h-[60dvh] place-items-center px-6 text-center">
        <p className="text-sm text-fg-muted">Diese Seite ist nur für Admins.</p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-2xl px-5 py-8 pb-24">
      <p className="text-xs tracking-[0.22em] text-fg-subtle uppercase">Admin</p>
      <h1 className="mt-1 font-display text-3xl">Moderation</h1>
      <AdminSections />
    </div>
  );
}
