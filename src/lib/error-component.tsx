import type { ErrorComponentProps } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, PawPrint, RotateCw, TriangleAlert } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { isStaleBuildError, reloadForNewBuild } from "@/lib/stale-reload";

const FALLBACK_MESSAGE = "Etwas ist schiefgelaufen. Bitte lade die Seite neu.";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

const primary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90";
const secondary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-5 text-sm font-medium text-fg transition-colors hover:border-border-strong hover:bg-fg/5";

function StatusScreen({
  eyebrow,
  title,
  body,
  icon,
  detail,
  actions,
}: {
  eyebrow?: string;
  title: string;
  body: string;
  icon: ReactNode;
  detail?: string;
  actions?: ReactNode;
}) {
  return (
    <main
      id="main"
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-bg px-6 py-16 text-center text-fg"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 30%, color-mix(in oklab, var(--color-accent) 12%, transparent), transparent 55%)",
        }}
      />
      <div className="relative flex max-w-md flex-col items-center">
        <span className="status-orb text-accent" aria-hidden="true">
          <span className="status-orb-float">{icon}</span>
        </span>
        <p className="mt-8 text-xs font-medium tracking-[0.28em] text-accent uppercase">
          {eyebrow ?? "Furry Gallery"}
        </p>
        <h1 className="mt-3 font-display text-3xl sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">{body}</p>
        {detail ? (
          <p
            role="alert"
            className="mt-5 w-full rounded-xl border border-border bg-bg-elevated px-4 py-3 text-left font-mono text-xs leading-relaxed break-words text-fg-muted"
          >
            {detail}
          </p>
        ) : null}
        <div className="mt-8 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-center">
          {actions ?? (
            <Link to="/" className={primary}>
              Zum Feed
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

function BackButton() {
  return (
    <button
      type="button"
      className={secondary}
      onClick={() => {
        if (window.history.length > 1) window.history.back();
        else window.location.assign("/");
      }}
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Zurück
    </button>
  );
}

export function AppErrorComponent({ error, reset }: ErrorComponentProps) {
  const stale = isStaleBuildError(error);
  const [reloading, setReloading] = useState(stale);
  useEffect(() => {
    if (stale) setReloading(reloadForNewBuild());
  }, [stale]);
  if (reloading) {
    return (
      <StatusScreen
        icon={<RotateCw className="size-10 animate-spin" strokeWidth={1.6} />}
        title="Neue Version"
        body="Die Seite wurde aktualisiert und lädt neu …"
        actions={<span />}
      />
    );
  }
  if (stale) {
    return (
      <StatusScreen
        icon={<RotateCw className="size-10" strokeWidth={1.6} />}
        title="Neue Version verfügbar"
        body="Bitte lade die Seite neu (Strg+F5 bzw. nach unten ziehen)."
        actions={
          <button type="button" className={primary} onClick={() => window.location.reload()}>
            <RotateCw className="size-4" aria-hidden="true" />
            Neu laden
          </button>
        }
      />
    );
  }
  return (
    <StatusScreen
      eyebrow="Hoppla"
      icon={<TriangleAlert className="size-10 text-heart" strokeWidth={1.6} />}
      title="Das hat nicht geklappt"
      body="Da ist uns etwas durch die Pfoten gerutscht. Versuch es gleich noch mal."
      detail={errorMessage(error)}
      actions={
        <>
          <button
            type="button"
            className={primary}
            onClick={() => {
              if (reset) reset();
              else window.location.reload();
            }}
          >
            <RotateCw className="size-4" aria-hidden="true" />
            Nochmal versuchen
          </button>
          <Link to="/" className={secondary}>
            Zum Feed
          </Link>
        </>
      }
    />
  );
}

export function NotFound() {
  return (
    <StatusScreen
      eyebrow="Fehler 404"
      icon={<PawPrint className="size-11" strokeWidth={1.5} />}
      title="Hier führt keine Spur hin"
      body="Diese Seite gibt es nicht (mehr). Vielleicht hat sich ein Link verlaufen."
      actions={
        <>
          <Link to="/" className={primary}>
            Zum Feed
          </Link>
          <Link to="/explore" className={secondary}>
            Gallery durchstöbern
          </Link>
          <BackButton />
        </>
      }
    />
  );
}
