/**
 * Settings → Konto: login overview, password change (e-mail accounts),
 * user id, sign out and deleting your own account.
 */
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Copy, Eye, EyeOff, KeyRound, Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { authClient, signOut } from "@/lib/auth/client";
import { deleteMyAccount, getAccountInfo } from "@/lib/vela/account-api";
import type { Profile } from "@/lib/vela/types";
import { SignOutButton } from "@/components/sign-out-button";
import { ProviderIcon } from "@/components/provider-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const PROVIDER_LABEL: Record<string, string> = { google: "Google", discord: "Discord" };

function PasswordChange() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 8) {
      setError("Das neue Passwort braucht mindestens 8 Zeichen.");
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      });
      if (err) {
        setError(
          err.code === "INVALID_PASSWORD"
            ? "Das aktuelle Passwort stimmt nicht."
            : err.status === 429
              ? "Zu viele Versuche. Warte kurz."
              : "Ändern hat nicht geklappt. Bitte nochmal.",
        );
        return;
      }
      toast.success("Passwort geändert. Andere Geräte wurden abgemeldet.");
      setCurrent("");
      setNext("");
      setOpen(false);
    } catch {
      setError("Keine Verbindung. Bitte nochmal.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        <KeyRound className="size-4" /> Passwort ändern
      </Button>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-border p-4">
      <div className="space-y-2">
        <Label htmlFor="pw-current">Aktuelles Passwort</Label>
        <Input
          id="pw-current"
          type={show ? "text" : "password"}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pw-new">Neues Passwort</Label>
        <div className="relative">
          <Input
            id="pw-new"
            type={show ? "text" : "password"}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
            className="pr-12"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute top-0 right-0 grid size-11 place-items-center text-fg-muted hover:text-fg"
            aria-label={show ? "Passwörter verbergen" : "Passwörter anzeigen"}
            aria-pressed={show}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <p className="text-xs text-fg-subtle">Mindestens 8 Zeichen.</p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-heart">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          className="flex-1"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Abbrechen
        </Button>
        <Button type="submit" className="flex-1" disabled={busy}>
          {busy ? "Speichert…" : "Speichern"}
        </Button>
      </div>
    </form>
  );
}

function DeleteAccount({ handle }: { handle: string }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const matches = confirm.trim().replace(/^@/, "").toLowerCase() === handle;

  async function remove() {
    setBusy(true);
    try {
      await deleteMyAccount({ data: { confirmHandle: confirm } });
      toast.success("Dein Konto wurde gelöscht. Mach’s gut!");
      // The session is gone with the user; clear what's left on this device.
      await signOut("/").catch(() => {
        window.location.href = "/";
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Löschen hat nicht geklappt.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 text-sm text-fg-muted hover:text-heart"
      >
        <Trash2 className="size-4" /> Konto löschen
      </button>
    );
  }
  return (
    <div className="space-y-3 rounded-xl border border-heart/40 bg-heart/5 p-4" role="group" aria-labelledby="delete-title">
      <p id="delete-title" className="flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="size-4 text-heart" /> Konto endgültig löschen?
      </p>
      <p className="text-xs leading-relaxed text-fg-muted">
        Weg sind dann: dein Profil, alle Bilder und Videos, Kommentare, Likes, Follower, Pfoten und
        Shop-Käufe. Das lässt sich nicht rückgängig machen.
      </p>
      <div className="space-y-2">
        <Label htmlFor="delete-confirm">
          Tippe <span className="font-mono text-fg">@{handle}</span> zur Bestätigung
        </Label>
        <Input
          id="delete-confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          placeholder={`@${handle}`}
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={() => {
            setOpen(false);
            setConfirm("");
          }}
        >
          Behalten
        </Button>
        <Button
          type="button"
          variant="danger"
          className="flex-1"
          disabled={!matches || busy}
          onClick={() => void remove()}
        >
          {busy ? "Löscht…" : "Endgültig löschen"}
        </Button>
      </div>
    </div>
  );
}

export function AccountSettings({ profile }: { profile: Profile }) {
  const info = useQuery({ queryKey: ["account-info"], queryFn: () => getAccountInfo() });

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-xl border border-border p-4">
        {info.isPending ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <>
            <div className="flex items-center gap-3 text-sm">
              <Mail className="size-4 shrink-0 text-fg-muted" />
              <span className="min-w-0 flex-1 truncate">
                {info.data?.email ?? "Keine E-Mail hinterlegt"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {info.data?.hasPassword ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-fg-muted">
                  <KeyRound className="size-3.5" /> E-Mail & Passwort
                </span>
              ) : null}
              {info.data?.providers.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-fg-muted"
                >
                  {p === "google" || p === "discord" ? (
                    <ProviderIcon id={p} className="size-3.5" />
                  ) : null}
                  {PROVIDER_LABEL[p] ?? p}
                </span>
              ))}
            </div>
            <p className="text-xs text-fg-subtle">
              Dabei seit {new Date(profile.createdAt).toLocaleDateString("de-DE", { dateStyle: "long" })}
            </p>
          </>
        )}
      </div>

      {info.data?.hasPassword ? <PasswordChange /> : null}

      <div className="space-y-2">
        <p className="text-sm font-medium">Deine Nutzer-ID</p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-bg-elevated px-3 py-2.5 text-xs text-fg-muted">
            {profile.userId}
          </code>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Nutzer-ID kopieren"
            onClick={() =>
              void navigator.clipboard
                .writeText(profile.userId)
                .then(() => toast.success("Nutzer-ID kopiert."))
                .catch(() => toast.error("Kopieren ging nicht."))
            }
          >
            <Copy className="size-4" />
          </Button>
        </div>
        <p className="text-xs text-fg-subtle">
          Braucht das Team z. B., um dich ins Team aufzunehmen.
        </p>
      </div>

      <SignOutButton />

      <div className="border-t border-border pt-4">
        <DeleteAccount handle={profile.handle} />
      </div>
    </div>
  );
}
