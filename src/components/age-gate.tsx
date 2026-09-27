import { useEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { readAdultConfirmed, writeAdultConfirmed } from "@/lib/vela/adult";
import { Button } from "@/components/ui/button";
import { LEGAL_LINKS, LegalLinks } from "@/components/legal-page";

const UNGATED_PATHS = new Set<string>(LEGAL_LINKS.map((l) => l.to));

export function AdultBoundary({ children }: { children: ReactNode }) {
  const [adult, setAdult] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (readAdultConfirmed()) setAdult(true);
  }, []);

  if (!adult && !UNGATED_PATHS.has(pathname)) {
    return (
      <AgeGate
        onConfirm={() => {
          writeAdultConfirmed();
          setAdult(true);
        }}
      />
    );
  }
  return <>{children}</>;
}

export function AgeGate({ onConfirm }: { onConfirm: () => void }) {
  const [blocked, setBlocked] = useState(false);

  if (blocked) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 text-center text-fg">
        <p className="text-xs tracking-[0.28em] text-accent uppercase">VELA</p>
        <h1 className="mt-4 font-display text-3xl">Nur ab 18</h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-fg-muted">
          Die Gallery ist ausschließlich für Erwachsene. Kein Eintritt unter 18.
        </p>
        <LegalLinks className="mt-10" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh flex-col bg-bg text-fg">
      <img
        src="/seed/post-alley.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-40"
      />
      <div className="absolute inset-0 bg-linear-to-b from-bg/50 via-bg/80 to-bg" />
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 py-10 text-center">
        <p className="text-xs font-medium tracking-[0.28em] text-accent uppercase">18+ · Gallery</p>
        <h1 className="mt-4 font-display text-6xl leading-none tracking-tight">VELA</h1>
        <p className="mt-5 max-w-sm text-base leading-relaxed text-fg-muted">
          Vertikaler Feed wie TikTok, Profile, Uploads. Erst das Alter — dann die Bilder. Stöbern
          geht ohne Konto.
        </p>
        <Button className="mt-10 h-14 w-full max-w-sm text-base" size="lg" onClick={onConfirm}>
          Ich bin 18 oder älter
        </Button>
        <button
          type="button"
          className="mt-4 min-h-11 px-3 text-sm text-fg-subtle underline-offset-4 hover:underline"
          onClick={() => setBlocked(true)}
        >
          Ich bin unter 18
        </button>
        <LegalLinks className="mt-10" />
      </div>
    </div>
  );
}
