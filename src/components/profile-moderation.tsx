/** Team tools on someone else's profile: ban (for a while or for good) and delete. */
import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, PawPrint, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { deleteProfile, setBanned } from "@/lib/vela/server";
import {
  BAN_DURATIONS,
  DELETE_DELAYS,
  formatDay,
  type BanDuration,
  type DeleteDelay,
} from "@/lib/vela/durations";
import type { Profile } from "@/lib/vela/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const REFRESH_KEYS = ["profile", "admin-banned", "admin-reports", "feed", "explore", "creators"];

export function ProfileModeration({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<"ban" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () =>
    Promise.all(REFRESH_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: [key] })));

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      await refresh();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Das hat nicht geklappt.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Moderation"
      className="mt-5 rounded-xl border border-border bg-bg-elevated/60 p-3"
    >
      <p className="flex items-center gap-2 px-1 text-xs tracking-[0.18em] text-fg-subtle uppercase">
        <PawPrint className="size-3.5" /> Team
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {profile.banned ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run(
                () => setBanned({ data: { handle: profile.handle, banned: false } }),
                `@${profile.handle} entsperrt.`,
              )
            }
          >
            Entsperren
          </Button>
        ) : (
          <Button size="sm" variant="danger" disabled={busy} onClick={() => setDialog("ban")}>
            <Ban className="size-4" /> Sperren
          </Button>
        )}
        {profile.deleteAt ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run(
                () => deleteProfile({ data: { handle: profile.handle, when: "cancel" } }),
                "Löschung aufgehoben.",
              )
            }
          >
            Löschung aufheben
          </Button>
        ) : (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setDialog("delete")}>
            <Trash2 className="size-4" /> Profil löschen
          </Button>
        )}
      </div>
      {profile.deleteAt ? (
        <p className="mt-2 px-1 text-xs text-heart">
          Wird am {formatDay(profile.deleteAt)} gelöscht.
        </p>
      ) : null}

      {dialog === "ban" ? (
        <BanDialog
          handle={profile.handle}
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={async (reason, duration) => {
            const label = BAN_DURATIONS.find((d) => d.id === duration)?.label ?? "";
            const ok = await run(
              () =>
                setBanned({
                  data: { handle: profile.handle, banned: true, reason, duration },
                }),
              `@${profile.handle} gesperrt (${label}).`,
            );
            if (ok) setDialog(null);
          }}
        />
      ) : null}
      {dialog === "delete" ? (
        <DeleteDialog
          handle={profile.handle}
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={async (when) => {
            const ok = await run(
              () => deleteProfile({ data: { handle: profile.handle, when } }),
              when === "now" ? `@${profile.handle} gelöscht.` : "Löschung geplant.",
            );
            if (!ok) return;
            setDialog(null);
            if (when === "now") void navigate({ to: "/" });
          }}
        />
      ) : null}
    </section>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-bg/80 p-4 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-bg-elevated p-5 text-fg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 place-items-center rounded-lg text-fg-muted"
            aria-label="Schließen"
          >
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Choices<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "h-9 rounded-full border px-3 text-sm",
            value === o.id ? "border-accent bg-accent text-accent-fg" : "border-border",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function BanDialog({
  handle,
  busy,
  onClose,
  onConfirm,
}: {
  handle: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string, duration: BanDuration) => void;
}) {
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState<BanDuration>("7d");
  return (
    <ModalShell title={`@${handle} sperren`} onClose={onClose}>
      <div className="mt-3 space-y-2">
        <Label>Dauer</Label>
        <Choices options={BAN_DURATIONS} value={duration} onChange={setDuration} label="Dauer" />
      </div>
      <div className="mt-4 space-y-2">
        <Label htmlFor="ban-reason">Begründung</Label>
        <Textarea
          id="ban-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          placeholder="Wird auf dem Profil angezeigt und per Discord geschickt."
        />
      </div>
      <Button
        className="mt-5 w-full"
        variant="danger"
        disabled={busy}
        onClick={() => onConfirm(reason.trim(), duration)}
      >
        {busy ? "Sperrt…" : "Sperren"}
      </Button>
    </ModalShell>
  );
}

function DeleteDialog({
  handle,
  busy,
  onClose,
  onConfirm,
}: {
  handle: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (when: DeleteDelay) => void;
}) {
  const [when, setWhen] = useState<DeleteDelay>("7d");
  const [sure, setSure] = useState(false);
  return (
    <ModalShell title={`@${handle} löschen`} onClose={onClose}>
      <p className="mt-2 text-sm text-fg-muted">
        Löscht das Profil mit allen Bildern, Videos, Kommentaren und Likes sowie den Login. Das kann
        nicht rückgängig gemacht werden.
      </p>
      <div className="mt-4 space-y-2">
        <Label>Wann?</Label>
        <Choices
          options={DELETE_DELAYS}
          value={when}
          onChange={(id) => {
            setWhen(id);
            setSure(false);
          }}
          label="Wann löschen"
        />
      </div>
      {when === "now" ? (
        <label className="mt-4 flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-(--color-accent)"
            checked={sure}
            onChange={(e) => setSure(e.target.checked)}
          />
          Ja, @{handle} jetzt endgültig löschen.
        </label>
      ) : (
        <p className="mt-4 text-xs text-fg-subtle">
          Das Mitglied bekommt eine Mitteilung. Bis dahin kannst du die Löschung aufheben.
        </p>
      )}
      <Button
        className="mt-5 w-full"
        variant="danger"
        disabled={busy || (when === "now" && !sure)}
        onClick={() => onConfirm(when)}
      >
        {busy ? "Bitte warten…" : when === "now" ? "Jetzt löschen" : "Löschung planen"}
      </Button>
    </ModalShell>
  );
}
