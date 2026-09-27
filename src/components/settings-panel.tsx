import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { compressImageFile } from "@/lib/vela/compress-image";
import { MEDIA_LIMITS, formatMb } from "@/lib/vela/media-limits";
import { getMyProfile, updateAvatar, updateBanner, updateProfile } from "@/lib/vela/server";
import { RELATIONSHIP_STATUSES } from "@/lib/vela/types";
import { BackgroundPicker } from "@/components/background-picker";
import { SignOutButton } from "@/components/sign-out-button";
import { Fsk18Settings } from "@/components/fsk18-settings";
import { InterestsSettings } from "@/components/interests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

export function SettingsPanel({ embedded = false }: { embedded?: boolean }) {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMyProfile() });
  const profile = me.data;
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [relationshipStatus, setRelationshipStatus] = useState("single");
  const [backgroundId, setBackgroundId] = useState("midnight");
  const [busy, setBusy] = useState(false);
  const [bannerBusy, setBannerBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName);
    setBio(profile.bio);
    setRelationshipStatus(profile.relationshipStatus);
    setBackgroundId(profile.backgroundId);
  }, [profile]);

  if (!profile) {
    return (
      <div className={embedded ? "py-6" : "mx-auto max-w-md px-5 py-10"}>
        <Skeleton className="h-40 w-full" />
      </div>
    );
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
    setBusy(true);
    try {
      await updateProfile({
        data: {
          displayName,
          bio,
          relationshipStatus: relationshipStatus as
            "single" | "taken" | "open" | "complicated" | "private",
          backgroundId,
        },
      });
      await invalidateOwnProfile();
      toast.success("Gespeichert.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function onAvatar(file: File | undefined) {
    if (!file) return;
    try {
      const dataUrl = await compressImageFile(file, {
        maxEdge: 512,
        quality: 0.78,
        keepGifUpTo: MEDIA_LIMITS.avatar,
      });
      await updateAvatar({ data: { dataUrl } });
      await invalidateOwnProfile();
      toast.success("Portrait aktualisiert.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Portrait fehlgeschlagen.");
    }
  }

  async function onBanner(file: File | undefined | null) {
    if (file === undefined) return;
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
    <div className={embedded ? "pb-10" : "mx-auto max-w-md px-5 py-8 pb-24"}>
      {embedded ? null : (
        <>
          <p className="text-xs tracking-[0.22em] text-fg-subtle uppercase">Konto</p>
          <h1 className="mt-1 font-display text-3xl">Einstellungen</h1>
        </>
      )}

      <section
        className={embedded ? "mt-4 flex items-center gap-4" : "mt-8 flex items-center gap-4"}
      >
        <label className="size-20 shrink-0 cursor-pointer overflow-hidden rounded-full bg-bg-subtle">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center font-display text-2xl">
              {profile.displayName.charAt(0)}
            </span>
          )}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => void onAvatar(e.target.files?.[0])}
          />
        </label>
        <div>
          <p className="font-medium">{profile.displayName}</p>
          <p className="text-sm text-fg-muted">@{profile.handle}</p>
          <p className="mt-1 text-xs text-fg-subtle">
            {profile.age} Jahre · Portrait tippen zum Ändern (auch GIF)
          </p>
        </div>
      </section>

      <section className="mt-8 space-y-3">
        <p className="text-sm font-medium">Banner</p>
        <div className="bg-swatch relative h-28 overflow-hidden rounded-xl" data-bg={backgroundId}>
          {profile.bannerUrl ? (
            <img src={profile.bannerUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="flex gap-3">
          <label className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center rounded-lg border border-border bg-bg-elevated px-4 text-sm">
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
          Bild oder GIF bis {formatMb(MEDIA_LIMITS.banner)}. Ohne Banner wird die Farbe unten
          genutzt.
        </p>
      </section>

      <form
        className="mt-8 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="name">Anzeigename</Label>
          <Input
            id="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            minLength={2}
            maxLength={40}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} />
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
        <div className="space-y-2">
          <Label>Hintergrundfarbe</Label>
          <BackgroundPicker value={backgroundId} onChange={setBackgroundId} />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Speichert…" : "Änderungen speichern"}
        </Button>
      </form>

      <InterestsSettings key={profile.interests.join()} initial={profile.interests} />

      <Fsk18Settings profile={profile} />

      <div className="mt-10">
        <SignOutButton />
      </div>
    </div>
  );
}
