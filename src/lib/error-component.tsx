import type { ErrorComponentProps } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { isStaleBuildError, reloadForNewBuild } from "@/lib/stale-reload";

const FALLBACK_MESSAGE = "Etwas ist schiefgelaufen. Bitte lade die Seite neu.";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

function StatusScreen({ title, body, icon }: { title: string; body: string; icon?: boolean }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-fg">
      {icon ? (
        <span className="text-heart" aria-hidden="true">
          <TriangleAlert className="size-10" strokeWidth={1.8} />
        </span>
      ) : (
        <p className="text-xs tracking-[0.28em] text-accent uppercase">Furry Gallery</p>
      )}
      <h1 className="font-display text-3xl">{title}</h1>
      <p className="max-w-md text-sm break-words text-fg-muted">{body}</p>
      <Link to="/" className="mt-4 min-h-11 text-sm text-fg underline-offset-4 hover:underline">
        Zurück zum Feed
      </Link>
    </main>
  );
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  const stale = isStaleBuildError(error);
  const [reloading, setReloading] = useState(stale);
  useEffect(() => {
    if (stale) setReloading(reloadForNewBuild());
  }, [stale]);
  if (reloading) {
    return <StatusScreen title="Neue Version" body="Die Seite wurde aktualisiert und lädt neu …" />;
  }
  if (stale) {
    return (
      <StatusScreen
        icon
        title="Neue Version verfügbar"
        body="Bitte lade die Seite neu (Strg+F5 bzw. nach unten ziehen)."
      />
    );
  }
  return <StatusScreen icon title="Das hat nicht geklappt" body={errorMessage(error)} />;
}

export function NotFound() {
  return <StatusScreen title="Nicht gefunden" body="Diese Seite gibt es hier nicht." />;
}
