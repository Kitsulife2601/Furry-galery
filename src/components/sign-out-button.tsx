import { useState, useSyncExternalStore } from "react";
import { signOut } from "@/lib/auth/client";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { Button } from "@/components/ui/button";

const subscribeToNothing = () => () => {};
const noGateOnServer = () => false;

export function SignOutButton() {
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
      variant="secondary"
      className="w-full"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signOut("/").catch(() => setBusy(false));
      }}
    >
      {busy ? "Wird abgemeldet…" : "Abmelden"}
    </Button>
  );
}
