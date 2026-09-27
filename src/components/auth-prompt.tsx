import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function AuthPrompt({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="mx-auto flex min-h-[70svh] max-w-sm flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-3xl">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-fg-muted">{body}</p>
      <Button asChild className="mt-8 h-14 w-full" size="lg">
        <Link to="/login">Mit E-Mail anmelden</Link>
      </Button>
      <Link to="/" className="mt-4 min-h-11 text-sm text-fg-subtle">
        Zurück zum Feed
      </Link>
    </div>
  );
}
