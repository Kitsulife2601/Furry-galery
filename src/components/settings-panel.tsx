import { useEffect, useState, type ReactNode } from "react";
import { bgStyle } from "@/lib/vela/bg-style";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { compressImageFile } from "@/lib/vela/compress-image";
import { MEDIA_LIMITS, formatMb } from "@/lib/vela/media-limits";
import { getMyProfile, updateAvatar, updateBanner, updateProfile } from "@/lib/vela/server";
import { RELATIONSHIP_STATUSES, type RelationshipStatus } from "@/lib/vela/types";
import { BackgroundPicker } from "@/components/background-picker";
import { canUseItem } from "@/lib/vela/shop";
import { ownedGenerated } from "@/lib/vela/catalog";
import { Fsk18Settings } from "@/components/fsk18-settings";
import { InterestsSettings } from "@/components/interests";
import { LookSettings } from "@/components/look-settings";
import { AccountSettings } from "@/components/account-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "profil", label: "Profil" },
  { id: "aussehen", label: "Aussehen" },
  { id: "interessen", label: "Interessen" },
  { id: "fsk18", label: "FSK 18" },
  { id: "konto", label: "Konto" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

/** The fields saved together with "Änderungen speichern". */
type Draft = {
  displayName: string;
  bio: string;
  relationshipStatus: RelationshipStatus;
  backgroundId: string;
};

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function Section({
  id,
  title,
  hint,
  children,
}: {
  id: SectionId;
  title?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={`set-${id}`}
      data-settings-section={id}
      aria-labelledby={title ? `set-${id}-title` : undefined}
      aria-label={title ? undefined : SECTIONS.find((s) => s.id === id)?.label}
      className="scroll-mt-20 pt-8"
    >
      {title ? (
        <div className="mb-5">
          <h2 id={`set-${id}-title`} className="font-display text-2xl">
            {title}
          </h2>
          {hint ? <p className="mt-1 text-xs text-fg-subtle">{hint}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Sticky chips that jump to a section and follow the scroll position. */
function SectionNav({ active, onJump }: { active: SectionId; onJump: (id: SectionId) => void }) {
  return (
    <nav
      aria-label="Bereiche"
      className="sticky top-0 z-20 -mx-5 border-b border-border bg-bg-elevated/90 px-5 py-2 backdrop-blur supports-[backdrop-filter]:bg-bg-elevated/75"
    >
      <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SECTIONS.map((s) => (
          <li key={s.id} className="shrink-0">
            <button
              type="button"
              onClick={() => onJump(s.id)}
              aria-current={active === s.id ? "true" : undefined}
              className={cn(
                "h-10 rounded-full px-4 text-sm transition-colors",
                active === s.id
                  ? "bg-accent text-accent-fg"
                  : "text-fg-muted hover:bg-bg-subtle hover:text-fg",
              )}
            >
              {s.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SettingsPanel({ embedded = false }: { embedded?: boolean }) {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMyProfile() });
  const profile = me.data;
  // Only what was edited; everything else follows the saved profile. So a
  // refetch (e.g. after picking a frame) never wipes half-typed changes.
  const [draft, setDraft] = useState<Partial<Draft>>({});
  const [busy, setBusy] = useState(false);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [active, setActive] = useState<SectionId>("profil");

  const saved: Draft | null = profile
    ? {
        displayName: profile.displayName,
        bio: profile.bio,
        relationshipStatus: profile.relationshipStatus,
        backgroundId: profile.backgroundId,
      }
    : null;
  const values: Draft | null = saved ? { ...saved, ...draft } : null;
  const dirty =
    saved !== null &&
    values !== null &&
    (Object.keys(saved) as (keyof Draft)[]).some((k) => values[k] !== saved[k]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Highlight the section that's currently in view.
  useEffect(() => {
    if (!profile) return;
    const els = document.querySelectorAll<HTMLElement>("[data-settings-section]");
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const id = hit?.target.getAttribute("data-settings-section") as SectionId | null;
        if (id) setActive(id);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [profile]);

  // Leaving the page with unsaved edits: let the browser ask.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  if (!profile || !values) {
    return (
      <div className={embedded ? "space-y-4 py-6" : "mx-auto max-w-md space-y-4 px-5 py-10"}>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  function jump(id: SectionId) {
    setActive(id);
    document
      .getElementById(`set-${id}`)
      ?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }

  // Name, avatar and status also show on posts and the public profile page.
  function invalidateOwnProfile() {
    return Promise.all(
      ["me", "profile", "feed", "explore", "profile-posts", "creators"].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
  }

  async function save() {
    if (!values) return;
    setBusy(true);
    try {
      await updateProfile({ data: values });
      await invalidateOwnProfile();
      setDraft({});
      toast.success("Gespeichert.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function onAvatar(file: File | undefined | null) {
    if (file === undefined) return;
    if (file === null && !window.confirm("Profilbild entfernen?")) return;
    setAvatarBusy(true);
    try {
      const dataUrl = file
        ? await compressImageFile(file, {
            maxEdge: 512,
            quality: 0.78,
            keepGifUpTo: MEDIA_LIMITS.avatar,
          })
        : null;
      await updateAvatar({ data: { dataUrl } });
      await invalidateOwnProfile();
      toast.success(file ? "Portrait aktualisiert." : "Profilbild entfernt.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Portrait fehlgeschlagen.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function onBanner(file: File | undefined | null) {
    if (file === undefined) return;
    if (file === null && !window.confirm("Banner entfernen?")) return;
    setBannerBusy(true);
    try {
      const dataUrl = file
        ? await compressImageFile(file, {
            maxEdge: 1600,
            quality: 0.8,
            keepGifUpTo: MEDIA_LIMITS.banner,
          })
        : null;
      await updateBanner({ data: { dataUrl } });
      await invalidateOwnProfile();
      toast.success(file ? "Banner aktualisiert." : "Banner entfernt.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Banner fehlgeschlagen.");
    } finally {
      setBannerBusy(false);
    }
  }

  return (
    <div className={embedded ? "pb-6" : "mx-auto max-w-md px-5 py-8 pb-24"}>
      {embedded ? null : (
        <div className="mb-4">
          <p className="text-xs tracking-[0.22em] text-fg-subtle uppercase">Konto</p>
          <h1 className="mt-1 font-display text-3xl">Einstellungen</h1>
        </div>
      )}

      <SectionNav active={active} onJump={jump} />

      <form
        id="settings-profile-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Section id="profil" title="Profil" hint="So sehen dich andere in der Gallery.">
          <div className="flex items-center gap-4">
            <label className="group relative size-20 shrink-0 cursor-pointer overflow-hidden rounded-full bg-bg-subtle focus-within:ring-2 focus-within:ring-ring/70">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="grid h-full w-full place-items-center font-display text-2xl">
                  {profile.displayName.charAt(0)}
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 grid h-7 place-items-center bg-bg/70">
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
                aria-label="Profilbild ändern"
                disabled={avatarBusy}
                onChange={(e) => void onAvatar(e.target.files?.[0])}
              />
            </label>
            <div className="min-w-0">
              <p className="truncate font-medium">{profile.displayName}</p>
              <p className="truncate text-sm text-fg-muted">@{profile.handle}</p>
              <p className="mt-1 text-xs text-fg-subtle">
                {profile.age} Jahre · Portrait tippen zum Ändern (auch GIF)
              </p>
              {profile.avatarUrl ? (
                <button
                  type="button"
                  disabled={avatarBusy}
                  onClick={() => void onAvatar(null)}
                  className="mt-1 inline-flex min-h-9 items-center gap-1.5 text-xs text-fg-muted hover:text-heart"
                >
                  <Trash2 className="size-3.5" />
                  {avatarBusy ? "Einen Moment…" : "Profilbild entfernen"}
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <p className="text-sm font-medium">Banner</p>
            <div
              className="bg-swatch relative h-28 overflow-hidden rounded-xl"
              data-bg={values.backgroundId}
              style={bgStyle(values.backgroundId)}
            >
              {profile.bannerUrl ? (
                <img src={profile.bannerUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="flex gap-3">
              <label className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center rounded-lg border border-border bg-bg-elevated px-4 text-sm focus-within:ring-2 focus-within:ring-ring/70 hover:bg-bg-subtle">
                {bannerBusy ? "Lädt…" : profile.bannerUrl ? "Banner ändern" : "Banner-Bild wählen"}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={bannerBusy}
                  onChange={(e) => void onBanner(e.target.files?.[0])}
                />
              </label>
              {profile.bannerUrl ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={bannerBusy}
                  onClick={() => void onBanner(null)}
                >
                  Entfernen
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-fg-subtle">
              Bild oder GIF bis {formatMb(MEDIA_LIMITS.banner)}. Ohne Banner wird dein
              Hintergrund (unter „Aussehen“) genutzt.
            </p>
          </div>

          <div className="mt-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Anzeigename</Label>
              <Input
                id="name"
                value={values.displayName}
                onChange={(e) => set("displayName", e.target.value)}
                minLength={2}
                maxLength={40}
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="bio">Bio</Label>
                <span className="text-xs text-fg-subtle tabular-nums">
                  {values.bio.length}/160
                </span>
              </div>
              <Textarea
                id="bio"
                value={values.bio}
                onChange={(e) => set("bio", e.target.value)}
                maxLength={160}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rel">Beziehung</Label>
              <select
                id="rel"
                value={values.relationshipStatus}
                onChange={(e) => set("relationshipStatus", e.target.value as RelationshipStatus)}
                className="h-11 w-full rounded-lg border border-border bg-bg-elevated px-3 text-sm text-fg focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none"
              >
                {RELATIONSHIP_STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Section>

        <Section id="aussehen" title="Aussehen" hint="Hintergrund, Rahmen, Effekte und Namen.">
          <div className="space-y-2">
            <Label>Hintergrund</Label>
            <BackgroundPicker
              value={values.backgroundId}
              onChange={(id) => set("backgroundId", id)}
              extra={ownedGenerated("background", profile.owned, profile.backgroundId)}
              isLocked={(id) =>
                id !== profile.backgroundId &&
                !canUseItem("background", id, {
                  activeDays: profile.activeDays ?? 0,
                  team: profile.isAdmin,
                  owned: profile.owned,
                })
              }
            />
          </div>
        </Section>
      </form>

      {/* Saved right away, so outside the profile form. */}
      <LookSettings profile={profile} />

      <Section id="interessen" title="Interessen">
        <InterestsSettings key={profile.interests.join()} initial={profile.interests} />
      </Section>

      <Section id="fsk18">
        <Fsk18Settings profile={profile} />
      </Section>

      <Section id="konto" title="Konto" hint="Anmeldung, Nutzer-ID und Konto löschen.">
        <AccountSettings profile={profile} />
      </Section>

      {/* Unsaved changes: stays in reach while scrolling. */}
      <div
        className={cn(
          "pointer-events-none sticky z-20 mt-6",
          embedded ? "bottom-3" : "bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:bottom-4",
        )}
      >
        <div
          className={cn(
            "pointer-events-auto flex items-center gap-2 rounded-2xl border border-border bg-bg-elevated/95 p-2 pl-4 shadow-lg backdrop-blur transition-[opacity,transform] duration-300 motion-reduce:transition-none",
            dirty ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
          )}
          aria-hidden={!dirty}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <span className="size-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            <span className="truncate">Ungespeicherte Änderungen</span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11"
            tabIndex={dirty ? 0 : -1}
            disabled={busy}
            onClick={() => setDraft({})}
          >
            Verwerfen
          </Button>
          <Button
            type="submit"
            form="settings-profile-form"
            size="sm"
            className="h-11"
            tabIndex={dirty ? 0 : -1}
            disabled={busy || !dirty}
          >
            {busy ? "Speichert…" : "Speichern"}
          </Button>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {dirty ? "Du hast ungespeicherte Änderungen." : ""}
      </p>
    </div>
  );
}
