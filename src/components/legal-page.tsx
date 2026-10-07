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

export type LegalSectionRef = { id: string; title: string };

/**
 * Shell for Impressum / Datenschutz: logo, title, table of contents (sticky on
 * wide screens), the sections and the footer.
 */
export function LegalPage({
  title,
  intro,
  updated,
  sections = [],
  children,
}: {
  title: string;
  intro?: ReactNode;
  /** "Stand" shown under the title, e.g. "Oktober 2026". */
  updated?: string;
  sections?: LegalSectionRef[];
  children: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-6 sm:py-12">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" aria-label="Furry Gallery, Startseite" className="inline-block">
            <LogoWordmark />
          </Link>
          <Link
            to="/"
            className="inline-flex min-h-11 items-center text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline"
          >
            Zur Galerie
          </Link>
        </div>
        <header className="mt-10 max-w-2xl">
          <h1 className="font-display text-4xl sm:text-5xl">{title}</h1>
          {updated ? <p className="mt-2 text-xs text-fg-subtle">Stand: {updated}</p> : null}
          {intro ? <div className="mt-4 text-sm leading-relaxed text-fg-muted">{intro}</div> : null}
        </header>
        <div className="mt-8 gap-12 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)]">
          {sections.length > 1 ? (
            <nav
              aria-label="Inhalt"
              className="mb-8 rounded-2xl border border-border bg-bg-elevated p-4 lg:sticky lg:top-6 lg:mb-0 lg:self-start lg:border-0 lg:bg-transparent lg:p-0"
            >
              <p className="text-xs tracking-[0.18em] text-fg-subtle uppercase">Inhalt</p>
              <ol className="mt-2 space-y-0.5 text-sm">
                {sections.map((sec, i) => (
                  <li key={sec.id}>
                    <a
                      href={`#${sec.id}`}
                      className="flex min-h-9 items-baseline gap-2 rounded-md py-1.5 text-fg-muted hover:text-fg max-lg:min-h-11"
                    >
                      <span className="w-5 shrink-0 text-xs text-fg-subtle tabular-nums">
                        {i + 1}.
                      </span>
                      <span>{sec.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
          <div className="legal-prose max-w-2xl space-y-10 text-sm leading-relaxed text-fg-muted [&_a]:break-words">
            {children}
          </div>
        </div>
        <SiteFooter className="mt-16 px-0" />
      </div>
    </main>
  );
}

/** One numbered block of a legal page; `id` matches the table of contents. */
export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="font-display text-xl text-fg">
        {title}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

/** Term + explanation list used for "what we store". */
export function LegalList({ items }: { items: { term: string; text: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-border rounded-2xl border border-border">
      {items.map((it) => (
        <div key={it.term} className="grid gap-1 p-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
          <dt className="font-medium text-fg">{it.term}</dt>
          <dd>{it.text}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Marks a value the site owner still has to fill in before going live. */
export function Placeholder({ children }: { children: ReactNode }) {
  return <mark className="rounded bg-heart/20 px-1 text-fg">[{children}]</mark>;
}
