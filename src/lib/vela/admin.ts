/**
 * Who may moderate on the website: profiles whose handle is listed in
 * ADMIN_HANDLES (comma-separated). Defaults to the site owner's handle.
 */
import { getSql } from "@/lib/db";

export function adminHandles(): string[] {
  const raw = typeof process !== "undefined" ? process.env.ADMIN_HANDLES : undefined;
  return (raw?.trim() ? raw : "kitsulife")
    .split(",")
    .map((h) => h.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean);
}

export async function isAdminUser(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const sql = await getSql();
  const rows = await sql<{ handle: string }>`
    select handle from profiles where user_id = ${userId} and banned_at is null
  `;
  return Boolean(rows[0] && adminHandles().includes(rows[0].handle));
}
