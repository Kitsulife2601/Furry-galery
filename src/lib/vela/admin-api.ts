/**
 * Moderation dashboard + feedback status (server functions).
 * Kept apart from server.ts so the moderation panel can grow on its own.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { isAdminUser } from "./admin";

async function requireAdmin(userId: string) {
  if (!(await isAdminUser(userId))) throw new Error("Nur für Admins.");
}

function asTime(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

export type AdminOverview = {
  openReports: number;
  openProfileReports: number;
  openFeedback: number;
  fsk18Approvals: number;
  banned: number;
  newMembers: number;
  newMembersPrev: number;
  newPosts: number;
  newPostsPrev: number;
  activeToday: number;
};

/** Counts for the moderation dashboard: open work plus this week's activity. */
export const adminOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AdminOverview> => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<Record<keyof AdminOverview, number>>`
      select
        (select count(distinct post_id)::int from reports where resolved_at is null) as "openReports",
        (select count(distinct profile_user_id)::int from profile_reports
           where resolved_at is null) as "openProfileReports",
        (select count(*)::int from feedback where done_at is null) as "openFeedback",
        (select count(*)::int from profiles where banned_at is null
           and (fsk18_manual_at is not null or fsk18_verified_at is not null)) as "fsk18Approvals",
        (select count(*)::int from profiles where banned_at is not null) as "banned",
        (select count(*)::int from profiles
           where created_at > now() - interval '7 days') as "newMembers",
        (select count(*)::int from profiles
           where created_at <= now() - interval '7 days'
             and created_at > now() - interval '14 days') as "newMembersPrev",
        (select count(*)::int from posts
           where created_at > now() - interval '7 days') as "newPosts",
        (select count(*)::int from posts
           where created_at <= now() - interval '7 days'
             and created_at > now() - interval '14 days') as "newPostsPrev",
        (select count(*)::int from active_days
           where day = (now() at time zone 'Europe/Berlin')::date) as "activeToday"
    `;
    const r = rows[0];
    const n = (v: unknown) => Number(v ?? 0) || 0;
    return {
      openReports: n(r?.openReports),
      openProfileReports: n(r?.openProfileReports),
      openFeedback: n(r?.openFeedback),
      fsk18Approvals: n(r?.fsk18Approvals),
      banned: n(r?.banned),
      newMembers: n(r?.newMembers),
      newMembersPrev: n(r?.newMembersPrev),
      newPosts: n(r?.newPosts),
      newPostsPrev: n(r?.newPostsPrev),
      activeToday: n(r?.activeToday),
    };
  });

/** Mark several feedback entries done (or open) at once. */
export const setFeedbackDoneMany = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({ ids: z.array(z.number().int().positive()).min(1).max(100), done: z.boolean() }),
  )
  .handler(async ({ context, data }): Promise<{ count: number }> => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const doneAt = data.done ? new Date().toISOString() : null;
    let count = 0;
    for (const id of data.ids) {
      const rows = await sql<{ id: number }>`
        update feedback set done_at = ${doneAt} where id = ${id} returning id
      `;
      count += rows.length;
    }
    return { count };
  });

export type MyFeedbackItem = {
  id: number;
  kind: string;
  body: string;
  createdAt: string;
  doneAt: string | null;
};

/** Your own feedback with its status, so you can see when the team handled it. */
export const myFeedback = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<MyFeedbackItem[]> => {
    const sql = await getSql();
    const rows = await sql<{
      id: number;
      kind: string;
      body: string;
      created_at: string;
      done_at: string | null;
    }>`
      select id, kind, body, created_at::text as created_at, done_at::text as done_at
      from feedback where user_id = ${context.userId}
      order by created_at desc
      limit 20
    `;
    return rows.map((r) => ({
      id: Number(r.id),
      kind: r.kind,
      body: r.body,
      createdAt: asTime(r.created_at),
      doneAt: r.done_at ? asTime(r.done_at) : null,
    }));
  });
