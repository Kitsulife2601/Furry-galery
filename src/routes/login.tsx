import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { authClient, authEnabled, signInWith, visibleSocialProviders } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Splash } from "@/components/splash";
import { SiteFooter } from "@/components/legal-page";

export const Route = createFileRoute("/login")({ component: Login });

/** Which of Google / Discord have their OAuth credentials configured. */
const getSignInProviders = createServerFn({ method: "GET" }).handler(async () => {
  const { enabledSocialProviders } = await import("@/lib/auth/server");
  return enabledSocialProviders;
});

/** Better Auth sends failed OAuth sign-ins back here as `?error=<code>`. */
function oauthErrorMessage(code: string): string {
  if (code === "access_denied") return "Anmeldung abgebrochen.";
  if (code === "account_not_linked") {
    return "Diese E-Mail gehört schon zu einem anderen Konto. Melde dich damit an.";
  }
  return `Anmeldung fehlgeschlagen (${code}). Bitte nochmal versuchen.`;
}

function Login() {
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const providers = useQuery({
    queryKey: ["sign-in-providers"],
    queryFn: () => getSignInProviders(),
    enabled: authEnabled,
  });
  const socialProviders = visibleSocialProviders(providers.data ?? []);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code) setError(oauthErrorMessage(code));
  }, []);

  if (isPending) return <Splash />;
  if (user) return <Navigate to="/" />;

  async function onEmail(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "up") {
        const { error: err } = await authClient.signUp.email({
          email,
          password,
          name,
        });
        if (err) throw new Error(err.message ?? "Registrierung fehlgeschlagen.");
      } else {
        const { error: err } = await authClient.signIn.email({ email, password });
        if (err) throw new Error(err.message ?? "Anmeldung fehlgeschlagen.");
      }
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Das hat nicht geklappt.");
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-bg text-fg">
      <img
        src="/seed/post-loft.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-30"
      />
      <div className="absolute inset-0 bg-bg/75" />
      <div className="relative mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-12">
        <Link to="/" className="font-display text-3xl tracking-tight">
          Furry Gallery
        </Link>
        <p className="mt-2 text-sm text-fg-muted">Eintritt ab 18. Google, Discord oder E-Mail.</p>

        {authEnabled ? (
          <div className="mt-8 space-y-3">
            {socialProviders.map((p) => (
              <Button
                key={p.id}
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => {
                  setError(null);
                  signInWith(p, { callbackURL: "/", errorCallbackURL: "/login" }).catch((err) =>
                    setError(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen."),
                  );
                }}
              >
                Weiter mit {p.label}
              </Button>
            ))}
          </div>
        ) : (
          <p className="mt-8 text-sm text-fg-muted">Anmeldung ist deaktiviert.</p>
        )}

        <div className="my-6 flex items-center gap-3 text-xs text-fg-subtle">
          <span className="h-px flex-1 bg-border" />
          oder E-Mail
          <span className="h-px flex-1 bg-border" />
        </div>

        <form className="space-y-4" onSubmit={onEmail}>
          {mode === "up" ? (
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="email">E-Mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Passwort</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={mode === "up" ? "new-password" : "current-password"}
            />
          </div>
          {error ? <p className="text-sm text-heart">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={busy || !authEnabled}>
            {busy ? "Einen Moment…" : mode === "up" ? "Konto anlegen" : "Anmelden"}
          </Button>
        </form>

        <button
          type="button"
          className="mt-4 text-sm text-fg-muted underline-offset-4 hover:underline"
          onClick={() => setMode(mode === "up" ? "in" : "up")}
        >
          {mode === "up" ? "Schon ein Konto? Anmelden" : "Neu hier? Konto anlegen"}
        </button>
      </div>
      <SiteFooter className="relative" />
    </main>
  );
}
