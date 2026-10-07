import { Link, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { LogoEmblem } from "@/components/logo";

export function AuthPrompt({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  // Back to this page after signing in.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const next = pathname === "/" ? undefined : pathname;
  return (
    <div className="mx-auto flex min-h-[70svh] max-w-sm flex-col items-center justify-center px-6 text-center">
      <LogoEmblem className="size-16 opacity-90" withText={false} />
      <h1 className="mt-5 font-display text-3xl">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-fg-muted">{body}</p>
      <Button asChild className="mt-8 h-14 w-full" size="lg">
        <Link to="/login" search={{ next }}>
          Anmelden
        </Link>
      </Button>
      <Button asChild variant="secondary" className="mt-3 w-full" size="lg">
        <Link to="/login" search={{ next, mode: "up" }}>
          Neu hier? Konto anlegen
        </Link>
      </Button>
      <p className="mt-3 text-xs text-fg-subtle">Mit Google, Discord oder E-Mail.</p>
      <Link
        to="/"
        className="mt-4 inline-flex min-h-11 items-center text-sm text-fg-subtle hover:text-fg"
      >
        Zurück zum Feed
      </Link>
    </div>
  );
}
