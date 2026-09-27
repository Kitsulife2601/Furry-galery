export function memberErrorMessage(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : "";
  if (msg === "Unauthorized" || /unauthor/i.test(msg)) {
    return "Bitte zuerst anmelden.";
  }
  if (msg === "Age verification required") {
    return "Bitte zuerst dein Profil anlegen. Nur ab 18.";
  }
  return msg || fallback;
}
