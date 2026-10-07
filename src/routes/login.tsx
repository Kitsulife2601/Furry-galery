import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import { authClient, authEnabled, signInWith, visibleSocialProviders } from "@/lib/auth/client";
import type { SocialProvider } from "@/lib/auth/providers";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { safeNextPath } from "@/lib/vela/next-path";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Splash } from "@/components/splash";
import { SiteFooter } from "@/components/legal-page";
import { LogoEmblem } from "@/components/logo";
import { ProviderIcon } from "@/components/provider-icons";
import { cn } from "@/lib/utils";

type LoginSearch = { next?: string; mode?: "in" | "up" };

export const Route = createFileRoute("/login")({
  component: Login,
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    next: typeof search.next === "string" ? search.next : undefined,
    mode: search.mode === "up" ? "up" : undefined,
  }),
});

/**
 * Which of Google / Discord have their OAuth credentials configured, and the
 * production host — the only one registered as redirect URL at Google/Discord.
 */
const getSignInProviders = createServerFn({ method: "GET" }).handler(async () => {
  const { enabledSocialProviders } = await import("@/lib/auth/server");
  const site = process.env.SITE_URL?.trim() || process.env.BETTER_AUTH_URL?.trim();
  let productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || null;
  if (site) {
    try {
      productionHost = new URL(site).host;
    } catch {
      // keep the Vercel host
    }
  }
  return { providers: enabledSocialProviders, productionHost };
});

/** Better Auth sends failed OAuth sign-ins back here as `?error=<code>`. */
function oauthErrorMessage(code: string): string {
  if (code === "access_denied") return "Anmeldung abgebrochen.";
  if (code === "account_not_linked") {
    return "Diese E-Mail gehört schon zu einem anderen Konto. Melde dich damit an.";
  }
  return `Anmeldung fehlgeschlagen (${code}). Bitte nochmal versuchen.`;
}

/** Friendly German text for Better Auth's e-mail/password error codes. */
function emailErrorMessage(
  err: { code?: string; message?: string; status?: number },
  mode: "in" | "up",
): string {
  const code = err.code ?? "";
  if (err.status === 429) return "Zu viele Versuche. Warte kurz und probier es dann nochmal.";
  if (code === "INVALID_EMAIL_OR_PASSWORD" || code === "INVALID_PASSWORD") {
    return "E-Mail oder Passwort stimmt nicht.";
  }
  if (code.startsWith("USER_ALREADY_EXISTS")) {
    return "Mit dieser E-Mail gibt es schon ein Konto. Melde dich einfach an.";
  }
  if (code === "PASSWORD_TOO_SHORT") return "Das Passwort braucht mindestens 8 Zeichen.";
  if (code === "PASSWORD_TOO_LONG") return "Das Passwort ist zu lang.";
  if (code === "INVALID_EMAIL") return "Das sieht nicht nach einer E-Mail-Adresse aus.";
  if (code === "USER_NOT_FOUND") return "Zu dieser E-Mail gibt es kein Konto. Leg eins an!";
  return mode === "up"
    ? "Registrierung hat nicht geklappt. Bitte nochmal versuchen."
    : "Anmeldung hat nicht geklappt. Bitte nochmal versuchen.";
}

function Login() {
  const search = Route.useSearch();
  const next = safeNextPath(search.next);
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<"in" | "up">(search.mode ?? "in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [socialBusy, setSocialBusy] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const providers = useQuery({
    queryKey: ["sign-in-providers"],
    queryFn: () => getSignInProviders(),
    enabled: authEnabled,
  });
  const socialProviders = visibleSocialProviders(providers.data?.providers ?? []);
  const productionHost = providers.data?.productionHost ?? null;

  // Google/Discord only accept the production address as return URL. Opened
  // from a Vercel deployment/preview link, sign in there instead (otherwise
  // Google shows "redirect_uri_mismatch").
  useEffect(() => {
    if (!productionHost) return;
    const { host, hostname, pathname, search } = window.location;
    if (host !== productionHost && hostname.endsWith(".vercel.app")) {
      window.location.replace(`https://${productionHost}${pathname}${search}`);
    }
  }, [productionHost]);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code) setError(oauthErrorMessage(code));
  }, []);

  if (isPending) return <Splash />;
  // `next` is a checked same-site path (see safeNextPath).
  if (user) return <Navigate to={next as "/"} replace />;

  function switchMode(to: "in" | "up") {
    setMode(to);
    setError(null);
    setForgotOpen(false);
  }

  function onSocial(p: SocialProvider) {
    setError(null);
    setSocialBusy(p.id);
    signInWith(p, { callbackURL: next, errorCallbackURL: "/login" })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen.");
      })
      // A redirect leaves the page; only reset when we're still here.
      .finally(() => setTimeout(() => setSocialBusy(null), 4000));
  }

  async function onEmail(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result =
        mode === "up"
          ? await authClient.signUp.email({ email: email.trim(), password, name: name.trim() })
          : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) {
        setError(emailErrorMessage(result.error, mode));
        setBusy(false);
        return;
      }
      window.location.href = next;
    } catch {
      setError("Keine Verbindung. Prüf dein Internet und versuch es nochmal.");
      setBusy(false);
    }
  }

  function onPasswordKey(e: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState?.("CapsLock") ?? false);
  }

  const passwordTooShort = mode === "up" && password.length > 0 && password.length < 8;

  return (
    <main className="relative flex min-h-dvh flex-col bg-bg text-fg">
      <div className="relative grid flex-1 md:grid-cols-[1.1fr_1fr]">
        {/* Hero: full-bleed picture with the brand — behind the form on phones. */}
        <div className="absolute inset-0 overflow-hidden md:relative md:inset-auto" aria-hidden="true">
          <img
            src="/seed/post-loft.jpg"
            alt=""
            className="h-full w-full object-cover opacity-30 md:opacity-80"
          />
          <div className="absolute inset-0 bg-bg/80 md:bg-gradient-to-t md:from-bg md:via-bg/40 md:to-bg/10" />
          <div className="absolute inset-x-0 bottom-0 hidden p-10 md:block lg:p-14">
            <p className="text-xs tracking-[0.28em] text-accent uppercase">Furry Gallery</p>
            <p className="mt-3 max-w-md font-display text-4xl leading-tight text-on-media lg:text-5xl">
              Kunst, Fursuits und Fotos — von der Community, für die Community.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2 text-xs text-on-media/80">
              {["Für dich-Feed", "Eigenes Profil", "Pfoten sammeln", "Ab 15 · FSK 18 ab 18"].map(
                (t) => (
                  <li key={t} className="rounded-full border border-on-media/20 bg-bg/40 px-3 py-1.5">
                    {t}
                  </li>
                ),
              )}
            </ul>
          </div>
        </div>

        <div className="relative flex flex-col justify-center px-5 py-10 sm:px-8">
          <div className="mx-auto w-full max-w-sm">
            <Link
              to="/"
              aria-label="Furry Gallery, Startseite"
              className="inline-block rounded-full focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none"
            >
              <LogoEmblem className="size-20" />
            </Link>
            <h1 className="mt-5 font-display text-3xl leading-tight sm:text-4xl">
              {mode === "up" ? "Willkommen im Rudel" : "Schön, dass du da bist"}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              {mode === "up"
                ? "Leg in einer Minute dein Konto an. Profile gibt es ab 15, FSK 18 erst ab 18."
                : "Melde dich an mit Google, Discord oder deiner E-Mail."}
            </p>

            <div
              role="tablist"
              aria-label="Anmelden oder registrieren"
              className="mt-6 grid grid-cols-2 rounded-xl border border-border bg-bg-elevated/80 p-1 backdrop-blur"
            >
              {(
                [
                  ["in", "Anmelden"],
                  ["up", "Registrieren"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={mode === id}
                  onClick={() => switchMode(id)}
                  className={cn(
                    "h-10 rounded-lg text-sm font-medium transition-colors",
                    mode === id ? "bg-bg-subtle text-fg shadow-sm" : "text-fg-muted hover:text-fg",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {authEnabled ? (
              socialProviders.length > 0 ? (
                <div className="mt-6 space-y-3">
                  {socialProviders.map((p) => (
                    <Button
                      key={p.id}
                      type="button"
                      variant="secondary"
                      size="lg"
                      className="w-full justify-center gap-3 bg-bg-elevated/90 backdrop-blur"
                      disabled={socialBusy !== null}
                      onClick={() => onSocial(p)}
                    >
                      {socialBusy === p.id ? (
                        <Loader2 className="size-5 animate-spin motion-reduce:animate-none" />
                      ) : (
                        <ProviderIcon id={p.id} className="size-5" />
                      )}
                      Weiter mit {p.label}
                    </Button>
                  ))}
                </div>
              ) : null
            ) : (
              <p className="mt-6 text-sm text-fg-muted">Anmeldung ist deaktiviert.</p>
            )}

            {socialProviders.length > 0 ? (
              <div className="my-6 flex items-center gap-3 text-xs text-fg-subtle">
                <span className="h-px flex-1 bg-border" />
                oder mit E-Mail
                <span className="h-px flex-1 bg-border" />
              </div>
            ) : (
              <div className="h-6" />
            )}

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
                    placeholder="Wie sollen wir dich nennen?"
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="email">E-Mail</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="du@beispiel.de"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Passwort</Label>
                  {mode === "in" ? (
                    <button
                      type="button"
                      className="min-h-8 text-xs text-fg-muted underline-offset-4 hover:text-fg hover:underline"
                      aria-expanded={forgotOpen}
                      aria-controls="forgot-hint"
                      onClick={() => setForgotOpen((v) => !v)}
                    >
                      Passwort vergessen?
                    </button>
                  ) : null}
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={onPasswordKey}
                    onKeyDown={onPasswordKey}
                    required
                    minLength={8}
                    className="pr-12"
                    aria-describedby="password-hint"
                    autoComplete={mode === "up" ? "new-password" : "current-password"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute top-0 right-0 grid h-11 w-11 place-items-center rounded-r-lg text-fg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none"
                    aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <p
                  id="password-hint"
                  className={cn(
                    "text-xs",
                    passwordTooShort ? "text-heart" : "text-fg-subtle",
                    mode === "in" && !capsLock ? "sr-only" : "",
                  )}
                  aria-live="polite"
                >
                  {capsLock
                    ? "Feststelltaste ist an."
                    : mode === "up"
                      ? `Mindestens 8 Zeichen${password.length ? ` · ${password.length}/8` : ""}`
                      : ""}
                </p>
                {forgotOpen && mode === "in" ? (
                  <div
                    id="forgot-hint"
                    className="rounded-xl border border-border bg-bg-elevated/90 p-3 text-xs leading-relaxed text-fg-muted"
                  >
                    Hast du dich mit Google oder Discord registriert? Dann nutz einfach den Knopf
                    oben — mit derselben E-Mail landest du in deinem Konto. Sonst schreib dem Team
                    auf unserem Discord, wir helfen dir weiter.
                  </div>
                ) : null}
              </div>
              {error ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-heart/40 bg-heart/10 p-3 text-sm text-fg"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-heart" />
                  <span>{error}</span>
                </div>
              ) : null}
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={busy || !authEnabled || passwordTooShort}
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                    Einen Moment…
                  </>
                ) : mode === "up" ? (
                  "Konto anlegen"
                ) : (
                  "Anmelden"
                )}
              </Button>
            </form>

            <button
              type="button"
              className="mt-4 min-h-11 text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline"
              onClick={() => switchMode(mode === "up" ? "in" : "up")}
            >
              {mode === "up" ? "Schon ein Konto? Anmelden" : "Neu hier? Konto anlegen"}
            </button>
            {mode === "up" ? (
              <p className="mt-2 text-xs leading-relaxed text-fg-subtle">
                Mit dem Konto akzeptierst du unsere{" "}
                <Link to="/datenschutz" className="underline underline-offset-4 hover:text-fg">
                  Datenschutzhinweise
                </Link>
                . Bleib respektvoll und teile nur eigene oder erlaubte Bilder.
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <SiteFooter className="relative bg-bg" />
    </main>
  );
}
