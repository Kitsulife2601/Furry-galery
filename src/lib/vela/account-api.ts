/**
 * Account self-service: handle availability (onboarding), login overview and
 * deleting your own account (settings → Konto).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { deleteProfileNow } from "./moderation";

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

export type HandleCheck = { handle: string; available: boolean; reason: string | null };

/** Is this @handle still free? Used while typing in the onboarding. */
export const checkHandle = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ handle: z.string().trim().toLowerCase().max(40) }))
  .handler(async ({ context, data }): Promise<HandleCheck> => {
    const handle = data.handle.replace(/^@/, "");
    if (!HANDLE_RE.test(handle)) {
      return { handle, available: false, reason: "3–20 Zeichen, nur a–z, 0–9 und _." };
    }
    const sql = await getSql();
    const rows = await sql<{ user_id: string }>`
      select user_id from profiles where handle = ${handle}
    `;
    const owner = rows[0]?.user_id;
    if (owner && owner !== context.userId) {
      return { handle, available: false, reason: "Schon vergeben." };
    }
    return { handle, available: true, reason: null };
  });

export type AccountInfo = {
  email: string | null;
  /** Signed up with e-mail + password (so the password can be changed). */
  hasPassword: boolean;
  /** Linked social logins, e.g. ["google", "discord"]. */
  providers: string[];
  createdAt: string | null;
};

export const getAccountInfo = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AccountInfo> => {
    const sql = await getSql();
    const [users, accounts] = await Promise.all([
      sql<{ email: string | null; created_at: string | Date | null }>`
        select email, "createdAt" as created_at from "user" where id = ${context.userId}
      `,
      sql<{ provider_id: string }>`
        select "providerId" as provider_id from "account" where "userId" = ${context.userId}
      `,
    ]);
    const user = users[0];
    const ids = accounts.map((a) => a.provider_id);
    const createdAt = user?.created_at ? new Date(user.created_at).toISOString() : null;
    return {
      email: user?.email ?? null,
      hasPassword: ids.includes("credential"),
      providers: [...new Set(ids.filter((id) => id !== "credential"))],
      createdAt,
    };
  });

/**
 * Delete your own account for good (posts, comments, likes, follows, login).
 * The handle has to be typed again as confirmation.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ confirmHandle: z.string().trim().toLowerCase().max(40) }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const rows = await sql<{ handle: string }>`
      select handle from profiles where user_id = ${context.userId}
    `;
    const handle = rows[0]?.handle;
    if (handle) {
      if (data.confirmHandle.replace(/^@/, "") !== handle) {
        throw new Error("Der Name stimmt nicht. Tippe deinen @Namen genau ab.");
      }
      await deleteProfileNow(context.userId);
    } else {
      // Login without profile (e.g. stopped in the onboarding): just the login.
      await sql`delete from "user" where id = ${context.userId}`;
    }
    return { ok: true };
  });
