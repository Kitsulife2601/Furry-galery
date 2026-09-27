import { Link } from "@tanstack/react-router";
import { SignInGate } from "@/lib/auth/gates";
import { Button } from "@/components/ui/button";

export function Landing() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-bg text-fg">
      <img
        src="/seed/post-alley.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-50"
      />
      <div className="absolute inset-0 bg-linear-to-b from-bg/40 via-bg/70 to-bg" />
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-end px-6 pb-16 pt-24">
        <p className="mb-3 text-xs font-medium tracking-[0.28em] text-accent uppercase">
          18+ · Gallery
        </p>
        <h1 className="font-display text-6xl leading-none tracking-tight text-fg">
          VELA
        </h1>
        <p className="mt-5 max-w-sm text-base leading-relaxed text-fg-muted">
          Bilder hochladen. Profile lesen. Hintergründe wählen. Nur für
          Erwachsene — Alter wird geprüft, Beziehungstatus bleibt sichtbar.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <SignInGate
            fallback={
              <Button asChild size="lg" className="w-full">
                <Link to="/login">Eintreten</Link>
              </Button>
            }
          >
            <Button asChild size="lg" className="w-full">
              <Link to="/">Weiter</Link>
            </Button>
          </SignInGate>
          <p className="text-center text-xs text-fg-subtle">
            Mit dem Eintritt bestätigst du, mindestens 18 Jahre alt zu sein.
          </p>
        </div>
      </div>
    </div>
  );
}
