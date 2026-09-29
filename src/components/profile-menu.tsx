/** The ⋯ menu on someone else's profile: report it; for the team also ban, delete and fix the age. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CalendarDays, Flag, MoreHorizontal, PawPrint, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  adminGetBirthdate,
  adminSetBirthdate,
  deleteProfile,
  reportProfile,
  setBanned,
} from "@/lib/vela/server";
import { ageFromBirthdate } from "@/lib/vela/age";
import { Input } from "@/components/ui/input";
import { useAppSession } from "@/lib/vela/app-session";
import { memberErrorMessage } from "@/lib/vela/errors";
import {
  BAN_DURATIONS,
  DELETE_DELAYS,
  type BanDuration,
  type DeleteDelay,
} from "@/lib/vela/durations";
import { PROFILE_REPORT_REASONS, type Profile, type ProfileReportReason } from "@/lib/vela/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const REFRESH_KEYS = [
  "team-birthdate",
  "profile",
  "admin-profile-reports",
  "admin-banned",
  "admin-reports",
  "feed",
  "explore",
  "creators",
];

export function ProfileMenu({ profile, isAdmin }: { profile: Profile; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const session = useAppSession();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"report" | "ban" | "delete" | "age" | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

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

  function pick(action: () => void) {
    setOpen(false);
    action();
  }

  const item =
    "flex h-11 w-full items-center gap-3 px-4 text-left text-sm text-fg hover:bg-bg-subtle disabled:opacity-40";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Mehr"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Mehr"
        className="grid size-9 place-items-center rounded-lg border border-border bg-bg-elevated text-fg-muted hover:text-fg"
      >
        <MoreHorizontal className="size-5" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute top-11 right-0 z-30 w-60 overflow-hidden rounded-xl border border-border bg-bg-elevated py-1 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            className={cn(item, "text-heart")}
            onClick={() =>
              pick(() => {
                if (!session.profile) {
                  toast.error("Anmelden und Profil anlegen, um zu melden.");
                  void navigate({ to: session.userId ? "/profile" : "/login" });
                  return;
                }
                setDialog("report");
              })
            }
          >
            <Flag className="size-4" /> Profil melden
          </button>
          {isAdmin ? (
            <>
              <p className="mt-1 flex items-center gap-2 border-t border-border px-4 pt-2 pb-1 text-[11px] tracking-[0.18em] text-fg-subtle uppercase">
                <PawPrint className="size-3" /> Team
              </p>
              {profile.banned ? (
                <button
                  type="button"
                  role="menuitem"
                  className={item}
                  disabled={busy}
                  onClick={() =>
                    pick(
                      () =>
                        void run(
                          () => setBanned({ data: { handle: profile.handle, banned: false } }),
                          `@${profile.handle} entsperrt.`,
                        ),
                    )
                  }
                >
                  <Ban className="size-4" /> Entsperren
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className={item}
                  onClick={() => pick(() => setDialog("ban"))}
                >
                  <Ban className="size-4" /> Sperren
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                className={item}
                onClick={() => pick(() => setDialog("age"))}
              >
                <CalendarDays className="size-4" /> Alter ändern
              </button>
              {profile.deleteAt ? (
                <button
                  type="button"
                  role="menuitem"
                  className={item}
                  disabled={busy}
                  onClick={() =>
                    pick(
                      () =>
                        void run(
                          () => deleteProfile({ data: { handle: profile.handle, when: "cancel" } }),
                          "Löschung aufgehoben.",
                        ),
                    )
                  }
                >
                  <Trash2 className="size-4" /> Löschung aufheben
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className={item}
                  onClick={() => pick(() => setDialog("delete"))}
                >
                  <Trash2 className="size-4" /> Profil löschen
                </button>
              )}
            </>
          ) : null}
        </div>
      ) : null}

      {dialog === "report" ? (
        <ProfileReportDialog handle={profile.handle} onClose={() => setDialog(null)} />
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
      {dialog === "age" ? (
        <AgeDialog
          handle={profile.handle}
          currentAge={profile.age}
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={async (birthdate) => {
            const age = ageFromBirthdate(birthdate);
            const ok = await run(
              () => adminSetBirthdate({ data: { handle: profile.handle, birthdate } }),
              age < 18
                ? `@${profile.handle} ist jetzt ${age}: FSK 18 gesperrt.`
                : `Alter von @${profile.handle} auf ${age} geändert.`,
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
    </div>
  );
}

function ProfileReportDialog({ handle, onClose }: { handle: string; onClose: () => void }) {
  const [reason, setReason] = useState<ProfileReportReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason) return;
    setBusy(true);
    try {
      await reportProfile({ data: { handle, reason, note } });
      toast.success("Danke. Wir sehen uns das an.");
      onClose();
    } catch (err) {
      toast.error(memberErrorMessage(err, "Melden fehlgeschlagen."));
      setBusy(false);
    }
  }

  return (
    <ModalShell title={`@${handle} melden`} onClose={onClose}>
      <p className="mt-1 text-sm text-fg-muted">Was stimmt mit diesem Profil nicht?</p>
      <ul className="mt-4 space-y-2">
        {PROFILE_REPORT_REASONS.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              aria-pressed={reason === r.id}
              onClick={() => setReason(r.id)}
              className={cn(
                "min-h-11 w-full rounded-lg border px-3 text-left text-sm",
                reason === r.id ? "border-accent bg-bg-subtle" : "border-border",
              )}
            >
              {r.label}
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 space-y-2">
        <Label htmlFor="profile-report-note">Details (optional)</Label>
        <Textarea
          id="profile-report-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
        />
      </div>
      <Button
        className="mt-5 w-full"
        variant="danger"
        disabled={!reason || busy}
        onClick={() => void submit()}
      >
        {busy ? "Wird gesendet…" : "Meldung senden"}
      </Button>
    </ModalShell>
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
  // Portal: the profile header is its own stacking context (z-10), which would
  // otherwise put this popup under the bottom navigation on phones.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-bg/80 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl border border-border bg-bg-elevated p-5 text-fg"
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
    </div>,
    document.body,
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

function AgeDialog({
  handle,
  currentAge,
  busy,
  onClose,
  onConfirm,
}: {
  handle: string;
  currentAge: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (birthdate: string) => void;
}) {
  const entered = useQuery({
    queryKey: ["team-birthdate", handle],
    queryFn: () => adminGetBirthdate({ data: { handle } }),
  });
  const [year, setYear] = useState("");
  const original = entered.data?.birthdate ?? null;
  const [oy, om, od] = original ? original.split("-") : ["", "", ""];

  // Only the year changes; day and month stay as entered (29.02. → 28.02. off leap years).
  let birthdate: string | null = null;
  if (original && /^\d{4}$/.test(year)) {
    const y = Number(year);
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const day = om === "02" && od === "29" && !leap ? "28" : od;
    birthdate = `${year}-${om}-${day}`;
  }
  const age = birthdate ? ageFromBirthdate(birthdate) : null;
  const valid = age !== null && age >= 0 && age <= 120 && birthdate !== original;
  const german = (iso: string) => iso.split("-").reverse().join(".");

  return (
    <ModalShell title={`Alter von @${handle} ändern`} onClose={onClose}>
      {entered.isPending ? (
        <p className="mt-1 text-sm text-fg-muted">Lädt…</p>
      ) : entered.isError || !original ? (
        <p className="mt-1 text-sm text-heart">Geburtsdatum konnte nicht geladen werden.</p>
      ) : (
        <>
          <div className="mt-2 rounded-lg border border-border bg-bg px-3 py-2.5">
            <p className="text-xs text-fg-subtle">Angegeben</p>
            <p className="text-sm font-medium">
              {german(original)} · {currentAge} Jahre
            </p>
          </div>
          <div className="mt-4 space-y-2">
            <Label htmlFor="team-birth-year">Richtiges Geburtsjahr</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-fg-muted tabular-nums">
                {od}.{om}.
              </span>
              <Input
                id="team-birth-year"
                inputMode="numeric"
                maxLength={4}
                placeholder={oy}
                value={year}
                onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="w-28 tabular-nums"
              />
            </div>
            <p className="text-xs text-fg-subtle">Tag und Monat bleiben wie angegeben.</p>
          </div>
        </>
      )}
      {valid ? (
        <p
          className={cn(
            "mt-3 rounded-lg border px-3 py-2 text-sm",
            age < 18 ? "border-heart/50 text-heart" : "border-border text-fg-muted",
          )}
        >
          {german(birthdate!)}:{" "}
          {age < 18
            ? age < 15
              ? `${age} Jahre. Unter 15: das Profil ist nicht mehr nutzbar, FSK 18 wird entfernt.`
              : `${age} Jahre. Unter 18: FSK-18-Freischaltung wird entfernt, FSK-18-Beiträge sind für diese Person unsichtbar.`
            : `neues Alter ${age} Jahre.`}
        </p>
      ) : null}
      <Button
        className="mt-5 w-full"
        variant={valid && age < 18 ? "danger" : "primary"}
        disabled={busy || !valid}
        onClick={() => birthdate && onConfirm(birthdate)}
      >
        {busy ? "Speichert…" : "Alter speichern"}
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
