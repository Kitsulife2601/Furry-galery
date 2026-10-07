import { useState, useSyncExternalStore } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "@/lib/auth/client";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const subscribeToNothing = () => () => {};
const noGateOnServer = () => false;

export function SignOutButton({
  className,
  variant = "secondary",
  label = "Abmelden",
}: {
  className?: string;
  variant?: "secondary" | "ghost";
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const gateSession = useSyncExternalStore(
    subscribeToNothing,
    hasGateSessionMarker,
    noGateOnServer,
  );
  if (gateSession) return null;
  return (
    <Button
      type="button"
      variant={variant}
      className={cn("w-full", className)}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signOut("/").catch(() => setBusy(false));
      }}
    >
      <LogOut className="size-4" aria-hidden="true" />
      {busy ? "Wird abgemeldet…" : label}
    </Button>
  );
}
