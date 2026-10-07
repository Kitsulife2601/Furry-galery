/**
 * Where to go after signing in (`/login?next=/upload`). Only same-site paths
 * are accepted, so the parameter can't be abused to send people elsewhere.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (raw.startsWith("/login") || raw.startsWith("/api/")) return "/";
  return raw;
}
