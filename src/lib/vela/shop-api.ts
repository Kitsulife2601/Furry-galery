/**
 * Shop extras: what the community buys most ("Beliebt"). Only counts, never
 * who bought what.
 */
import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { shopPrice, type ShopKind } from "./shop";

export type PopularItem = { kind: ShopKind; id: string; count: number };

const KINDS = new Set<string>(["background", "decoration", "effect", "name", "plate"]);

/** The most bought items of the last 60 days (all time as fallback), up to 12. */
export const getShopPopular = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async (): Promise<PopularItem[]> => {
    const sql = await getSql();
    const rows = await sql<{ kind: string; item_id: string; n: number; recent: number }>`
      select kind, item_id, count(*)::int as n,
             count(*) filter (where created_at > now() - interval '60 days')::int as recent
      from shop_purchases
      group by kind, item_id
      order by recent desc, n desc, item_id
      limit 40
    `;
    return rows
      .filter((r) => KINDS.has(r.kind) && shopPrice(r.kind as ShopKind, r.item_id) !== null)
      .slice(0, 12)
      .map((r) => ({ kind: r.kind as ShopKind, id: r.item_id, count: Number(r.n) }));
  });
