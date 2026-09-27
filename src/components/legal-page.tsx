import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

export const LEGAL_LINKS = [
  { to: "/impressum", label: "Impressum" },
  { to: "/datenschutz", label: "Datenschutz" },
] as const;

/** Small footer row with the legal links; shown on gates, login and settings. */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav className={`flex justify-center gap-4 text-xs text-fg-subtle ${className}`}>
      {LEGAL_LINKS.map((l) => (
        <Link key={l.to} to={l.to} className="underline-offset-4 hover:underline">
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link to="/" className="font-display text-2xl tracking-tight">
          Furry Gallery
        </Link>
        <h1 className="mt-8 font-display text-4xl">{title}</h1>
        <div className="legal-prose mt-8 space-y-6 text-sm leading-relaxed text-fg-muted">
          {children}
        </div>
        <LegalLinks className="mt-12 justify-start" />
      </div>
    </main>
  );
}

/** Marks a value the site owner still has to fill in before going live. */
export function Placeholder({ children }: { children: ReactNode }) {
  return <mark className="rounded bg-heart/20 px-1 text-fg">[{children}]</mark>;
}
