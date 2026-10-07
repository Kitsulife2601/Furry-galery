import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Camera, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { createProfile, updateAvatar } from "@/lib/vela/server";
import { checkHandle } from "@/lib/vela/account-api";
import { MIN_AGE, ageFromBirthdate, isAllowedBirthdate } from "@/lib/vela/age";
import { compressImageFile } from "@/lib/vela/compress-image";
import { MEDIA_LIMITS } from "@/lib/vela/media-limits";
import { RELATIONSHIP_STATUSES, type RelationshipStatus } from "@/lib/vela/types";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/sign-out-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LogoEmblem } from "@/components/logo";
import { cn } from "@/lib/utils";

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

function suggestHandle(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9_]+/g, "")
    .slice(0, 16);
}

/** Today as local `YYYY-MM-DD` (not UTC, so late evenings don't jump a day). */
function localToday() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Steps({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center gap-3" aria-label={`Schritt ${step} von 2`}>
      <div className="flex flex-1 gap-1.5" aria-hidden="true">
        {[1, 2].map((n) => (
          <span
            key={n}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-500",
              n <= step ? "bg-accent" : "bg-bg-subtle",
            )}
          />
        ))}
      </div>
      <span className="text-xs text-fg-subtle tabular-nums">Schritt {step} von 2</span>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8 sm:py-12">
        <Link to="/" aria-label="Furry Gallery, Startseite" className="self-start">
          <LogoEmblem className="size-12" />
        </Link>
        <div className="flex flex-1 flex-col justify-center py-6">{children}</div>
        <div className="mt-6 border-t border-border pt-4 text-center">
          <p className="mb-2 text-xs text-fg-subtle">Falsches Konto?</p>
          <SignOutButton variant="ghost" className="text-fg-muted" />
        </div>
      </div>
    </div>
  );
}

export function Onboarding() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"age" | "profile" | "blocked">("age");
  const [birthdate, setBirthdate] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleTouched, setHandleTouched] = useState(false);
  const [bio, setBio] = useState("");
  const [relationshipStatus, setRelationshipStatus] = useState<RelationshipStatus>("single");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const today = useMemo(localToday, []);

  const age = birthdate ? ageFromBirthdate(birthdate) : -1;
  const finalHandle = handle || suggestHandle(displayName);
  const debouncedHandle = useDebounced(finalHandle, 350);
  const handleValid = HANDLE_RE.test(finalHandle);
  const handleCheck = useQuery({
    queryKey: ["handle-check", debouncedHandle],
    queryFn: () => checkHandle({ data: { handle: debouncedHandle } }),
    enabled: step === "profile" && HANDLE_RE.test(debouncedHandle),
    staleTime: 30_000,
  });
  const checkFresh = handleCheck.data?.handle === finalHandle;
  const handleTaken = checkFresh && handleCheck.data?.available === false;
  const handleFree = checkFresh && handleCheck.data?.available === true;

  function confirmAge() {
    setError(null);
    if (!birthdate) {
      setError("Bitte dein Geburtsdatum eintragen.");
      return;
    }
    if (age < 0 || birthdate > today || birthdate < "1920-01-01") {
      setError("Das Datum sieht nicht richtig aus.");
      return;
    }
    if (!isAllowedBirthdate(birthdate)) {
      setStep("blocked");
      return;
    }
    setStep("profile");
  }

  async function pickAvatar(file: File | undefined) {
    if (!file) return;
    setAvatarBusy(true);
    try {
      setAvatar(
        await compressImageFile(file, {
          maxEdge: 512,
          quality: 0.78,
          keepGifUpTo: MEDIA_LIMITS.avatar,
        }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Das Bild ging nicht.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function submitProfile() {
    setError(null);
    if (!handleValid) {
      setError("Handle: 3–20 Zeichen, nur a–z, 0–9 und _.");
      return;
    }
    if (handleTaken) {
      setError(`@${finalHandle} ist schon vergeben. Probier einen anderen.`);
      return;
    }
    setBusy(true);
    try {
      await createProfile({
        data: { displayName, handle: finalHandle, bio, birthdate, relationshipStatus },
      });
      if (avatar) {
        // The profile exists now; a failed picture shouldn't block entering.
        await updateAvatar({ data: { dataUrl: avatar } }).catch(() =>
          toast.error("Profilbild hat nicht geklappt — du kannst es in den Einstellungen setzen."),
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Willkommen in der Furry Gallery!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Das hat nicht geklappt.");
      setBusy(false);
    }
  }

  if (step === "blocked") {
    return (
      <Shell>
        <div className="text-center">
          <p className="text-xs tracking-[0.28em] text-accent uppercase">Furry Gallery</p>
          <h1 className="mt-4 font-display text-3xl">Erst ab {MIN_AGE}</h1>
          <p className="mt-4 text-sm leading-relaxed text-fg-muted">
            Ein Profil in der Furry Gallery gibt es ab {MIN_AGE} Jahren. Mit diesem Geburtsdatum
            kannst du noch keins anlegen. Schauen geht trotzdem — wir freuen uns auf dich, wenn es
            so weit ist!
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <Button asChild size="lg" className="w-full max-w-64">
              <Link to="/">Zur Startseite</Link>
            </Button>
            <button
              type="button"
              className="min-h-11 text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline"
              onClick={() => {
                setStep("age");
                setError(null);
              }}
            >
              Datum falsch eingegeben?
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  if (step === "age") {
    return (
      <Shell>
        <Steps step={1} />
        <h1 className="mt-8 font-display text-3xl sm:text-4xl">Wie alt bist du?</h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          Wir brauchen dein Geburtsdatum, bevor Profile, Uploads und Einstellungen frei werden. Das
          Datum bleibt privat — andere sehen nur dein Alter.
        </p>
        <form
          className="mt-8"
          onSubmit={(e) => {
            e.preventDefault();
            confirmAge();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="birthdate">Geburtsdatum</Label>
            <Input
              id="birthdate"
              type="date"
              min="1920-01-01"
              max={today}
              value={birthdate}
              onChange={(e) => {
                setBirthdate(e.target.value);
                setError(null);
              }}
              className="text-base"
            />
          </div>
          <div aria-live="polite" className="mt-3 min-h-10 text-sm">
            {error ? (
              <p className="text-heart">{error}</p>
            ) : age >= 18 && age < 110 ? (
              <p className="text-fg-muted">
                Du bist {age}. Alles frei — FSK 18 kannst du später per Discord freischalten.
              </p>
            ) : age >= MIN_AGE && age < 18 ? (
              <p className="text-fg-muted">
                Du bist {age}. Profil passt! FSK-18-Inhalte bleiben bis zu deinem 18. ausgeblendet.
              </p>
            ) : null}
          </div>
          <Button className="mt-4 w-full" size="lg" type="submit">
            Alter prüfen
          </Button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell>
      <Steps step={2} />
      <div className="mt-8 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl">Dein Profil</h1>
          <p className="mt-2 text-sm text-fg-muted">So finden und erkennen dich andere.</p>
        </div>
        <button
          type="button"
          onClick={() => setStep("age")}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="size-4" /> Zurück
        </button>
      </div>
      <form
        className="mt-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submitProfile();
        }}
      >
        <div className="flex items-center gap-4">
          <label className="group relative size-20 shrink-0 cursor-pointer overflow-hidden rounded-full border border-border bg-bg-subtle focus-within:ring-2 focus-within:ring-ring/70">
            {avatar ? (
              <img src={avatar} alt="Dein Profilbild" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center font-display text-2xl text-fg-muted">
                {displayName.trim().charAt(0).toUpperCase() || <Camera className="size-6" />}
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 grid h-7 place-items-center bg-bg/70 text-fg opacity-90 group-hover:opacity-100">
              {avatarBusy ? (
                <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
              ) : (
                <Camera className="size-3.5" />
              )}
            </span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Profilbild wählen"
              onChange={(e) => void pickAvatar(e.target.files?.[0])}
            />
          </label>
          <div className="min-w-0 text-sm">
            <p className="font-medium">Profilbild</p>
            <p className="text-xs leading-relaxed text-fg-subtle">
              Optional, auch GIF. Kannst du später jederzeit ändern.
            </p>
            {avatar ? (
              <button
                type="button"
                onClick={() => setAvatar(null)}
                className="mt-1 inline-flex min-h-9 items-center gap-1 text-xs text-fg-muted hover:text-heart"
              >
                <X className="size-3.5" /> Entfernen
              </button>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Anzeigename</Label>
          <Input
            id="name"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              if (!handleTouched) setHandle(suggestHandle(e.target.value));
            }}
            placeholder="Mira Sol"
            required
            minLength={2}
            maxLength={40}
            autoComplete="nickname"
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
              className={cn(
                "pr-10 pl-8",
                handleTaken && "border-heart/60",
                handleFree && "border-accent/60",
              )}
              value={handle}
              onChange={(e) => {
                setHandleTouched(true);
                setHandle(e.target.value.toLowerCase().replace(/\s+/g, "_"));
              }}
              placeholder="mira"
              required
              minLength={3}
              maxLength={20}
              pattern="[a-z0-9_]{3,20}"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-describedby="handle-status"
              aria-invalid={handleTaken || (handle.length > 0 && !handleValid)}
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2">
              {handleValid && !checkFresh && !handleCheck.isError ? (
                <Loader2 className="size-4 animate-spin text-fg-subtle motion-reduce:animate-none" />
              ) : handleFree ? (
                <Check className="size-4 text-accent" />
              ) : handleTaken ? (
                <X className="size-4 text-heart" />
              ) : null}
            </span>
          </div>
          <p
            id="handle-status"
            aria-live="polite"
            className={cn("text-xs", handleTaken ? "text-heart" : "text-fg-subtle")}
          >
            {!finalHandle
              ? "Dein @Name in der Gallery: a–z, 0–9 und _."
              : !handleValid
                ? "3–20 Zeichen, nur a–z, 0–9 und _."
                : handleTaken
                  ? `@${finalHandle} ist schon vergeben.`
                  : handleFree
                    ? `@${finalHandle} ist frei.`
                    : handleCheck.isError
                      ? "Konnte nicht prüfen — wir checken beim Speichern."
                      : "Prüfe…"}
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="bio">Bio</Label>
            <span className="text-xs text-fg-subtle tabular-nums">{bio.length}/160</span>
          </div>
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
            onChange={(e) => setRelationshipStatus(e.target.value as RelationshipStatus)}
            className="h-11 w-full rounded-lg border border-border bg-bg-elevated px-3 text-sm text-fg focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none"
          >
            {RELATIONSHIP_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-heart">
            {error}
          </p>
        ) : null}
        <Button
          className="w-full"
          size="lg"
          type="submit"
          disabled={busy || avatarBusy || handleTaken}
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              Wird angelegt…
            </>
          ) : (
            "Profil öffnen"
          )}
        </Button>
      </form>
    </Shell>
  );
}
