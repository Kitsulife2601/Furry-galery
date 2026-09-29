import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { LogoWordmark } from "@/components/logo";

/** Contact details for Impressum and Datenschutz (one place to change them). */
export const CONTACT = {
  name: "Dennis",
  city: "21706 Drochtersen",
  country: "Deutschland",
  email: "dennis210me@gmail.com" as string | null,
};

/** The contact e-mail as a mailto link, or a placeholder while it is missing. */
export function ContactEmail() {
  return CONTACT.email ? (
    <a href={`mailto:${CONTACT.email}`} className="underline underline-offset-4">
      {CONTACT.email}
    </a>
  ) : (
    <Placeholder>E-Mail-Adresse</Placeholder>
  );
}

export const COMMUNITY_LINKS = [
  { to: "/updates", label: "Updates" },
  { to: "/feedback", label: "Feedback" },
] as const;

export const LEGAL_LINKS = [
  { to: "/impressum", label: "Impressum" },
  { to: "/datenschutz", label: "Datenschutz" },
] as const;

/** Site-wide footer: copyright plus Impressum and Datenschutz. */
export function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer
      className={`flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-border px-5 py-5 text-xs text-fg-subtle md:justify-between ${className}`}
    >
      <span>© {new Date().getFullYear()} Furry Gallery</span>
      <nav aria-label="Rechtliches" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
        {[...COMMUNITY_LINKS, ...LEGAL_LINKS].map((l) => (
          <Link key={l.to} to={l.to} className="underline-offset-4 hover:text-fg hover:underline">
            {l.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link to="/" aria-label="Furry Gallery, Startseite" className="inline-block">
          <LogoWordmark />
        </Link>
        <h1 className="mt-8 font-display text-4xl">{title}</h1>
        <div className="legal-prose mt-8 space-y-6 text-sm leading-relaxed text-fg-muted">
          {children}
        </div>
        <SiteFooter className="mt-12 px-0" />
      </div>
    </main>
  );
}

/** Marks a value the site owner still has to fill in before going live. */
export function Placeholder({ children }: { children: ReactNode }) {
  return <mark className="rounded bg-heart/20 px-1 text-fg">[{children}]</mark>;
}
