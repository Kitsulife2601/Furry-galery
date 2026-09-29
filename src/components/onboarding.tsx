import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createProfile } from "@/lib/vela/server";
import { MIN_AGE, isAllowedBirthdate } from "@/lib/vela/age";
import { RELATIONSHIP_STATUSES } from "@/lib/vela/types";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/sign-out-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function suggestHandle(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 16);
}

export function Onboarding() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"age" | "profile" | "blocked">("age");
  const [birthdate, setBirthdate] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [relationshipStatus, setRelationshipStatus] = useState("single");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  function confirmAge() {
    setError(null);
    if (!birthdate) {
      setError("Bitte dein Geburtsdatum eintragen.");
      return;
    }
    if (!isAllowedBirthdate(birthdate)) {
      setStep("blocked");
      return;
    }
    setStep("profile");
  }

  async function submitProfile() {
    setError(null);
    setBusy(true);
    try {
      await createProfile({
        data: {
          displayName,
          handle: handle || suggestHandle(displayName),
          bio,
          birthdate,
          relationshipStatus: relationshipStatus as
            "single" | "taken" | "open" | "complicated" | "private",
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Das hat nicht geklappt.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "blocked") {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 text-center">
        <p className="text-xs tracking-[0.28em] text-accent uppercase">Furry Gallery</p>
        <h1 className="mt-4 font-display text-3xl">Erst ab {MIN_AGE}</h1>
        <p className="mt-4 text-sm leading-relaxed text-fg-muted">
          Ein Profil in der Furry Gallery gibt es ab {MIN_AGE} Jahren. Mit diesem Geburtsdatum
          kannst du noch keins anlegen.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <Button asChild className="w-full max-w-60">
            <Link to="/">Zur Startseite</Link>
          </Button>
          <div className="w-full max-w-60">
            <SignOutButton />
          </div>
        </div>
      </div>
    );
  }

  if (step === "age") {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
        <p className="text-xs tracking-[0.28em] text-accent uppercase">Schritt 1</p>
        <h1 className="mt-3 font-display text-3xl">Wie alt bist du?</h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          Wir brauchen dein Geburtsdatum, bevor Profile, Uploads und Einstellungen frei werden. Das
          Datum bleibt privat — andere sehen nur dein Alter.
        </p>
        <div className="mt-8 space-y-2">
          <Label htmlFor="birthdate">Geburtsdatum</Label>
          <Input
            id="birthdate"
            type="date"
            min="1920-01-01"
            max={today}
            value={birthdate}
            onChange={(e) => setBirthdate(e.target.value)}
          />
        </div>
        {error ? <p className="mt-3 text-sm text-heart">{error}</p> : null}
        <Button className="mt-6 w-full" size="lg" onClick={confirmAge}>
          Alter prüfen
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <p className="text-xs tracking-[0.28em] text-accent uppercase">Schritt 2</p>
      <h1 className="mt-3 font-display text-3xl">Dein Profil</h1>
      <p className="mt-3 text-sm text-fg-muted">
        Name, Handle, Beziehung — so finden dich andere in der Gallery.
      </p>
      <form
        className="mt-8 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submitProfile();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="name">Anzeigename</Label>
          <Input
            id="name"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              if (!handle) setHandle(suggestHandle(e.target.value));
            }}
            placeholder="Mira Sol"
            required
            minLength={2}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="handle">Handle</Label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-fg-subtle">
              @
            </span>
            <Input
              id="handle"
              className="pl-8"
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase())}
              placeholder="mira"
              required
              minLength={3}
              maxLength={20}
              pattern="[a-z0-9_]{3,20}"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={160}
            placeholder="Kurz, wahr, ohne Drama."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rel">Beziehung</Label>
          <select
            id="rel"
            value={relationshipStatus}
            onChange={(e) => setRelationshipStatus(e.target.value)}
            className="h-11 w-full rounded-lg border border-border bg-bg-elevated px-3 text-sm text-fg"
          >
            {RELATIONSHIP_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        {error ? <p className="text-sm text-heart">{error}</p> : null}
        <Button className="w-full" size="lg" type="submit" disabled={busy}>
          {busy ? "Wird angelegt…" : "Profil öffnen"}
        </Button>
      </form>
    </div>
  );
}
