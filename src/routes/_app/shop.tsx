import { useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, Package, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { buyShopBundle, buyShopItem, equipShopItem, getMyProfile } from "@/lib/vela/server";
import { BACKGROUNDS } from "@/lib/vela/backgrounds";
import { AVATAR_DECORATIONS, NAME_PLATES, PROFILE_EFFECTS } from "@/lib/vela/decorations";
import { NAME_STYLES, unlockDay } from "@/lib/vela/rewards";
import {
  BUNDLES,
  BUNDLE_DISCOUNT,
  CLASSIC_COLLECTION,
  COLLECTIONS,
  bundleCollection,
  collectionOf,
  DAILY_PAW_CAP,
  SHOP_ONLY,
  bundleQuote,
  canUseItem,
  ownedKey,
  shopPrice,
  type ShopKind,
} from "@/lib/vela/shop";
import { PAWS_KEY, usePaws } from "@/lib/vela/use-paws";
import { memberErrorMessage } from "@/lib/vela/errors";
import type { Profile } from "@/lib/vela/types";
import { DecoratedAvatar, ProfileEffectLayer } from "@/components/avatar-decoration";
import { StyledName } from "@/components/styled-name";
import { NamePlate } from "@/components/name-plate";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/shop")({ component: Shop });

type Item = { kind: ShopKind; id: string; label: string; price: number };

const LABELS: Record<ShopKind, readonly { id: string; label: string }[]> = {
  background: BACKGROUNDS,
  decoration: AVATAR_DECORATIONS,
  effect: PROFILE_EFFECTS,
  name: NAME_STYLES,
  plate: NAME_PLATES,
};

function itemLabel(kind: ShopKind, id: string): string {
  return LABELS[kind].find((x) => x.id === id)?.label ?? id;
}

/** Shop-only items first ("Neu"), then the rest. */
const isNew = (item: Item) => ownedKey(item.kind, item.id) in SHOP_ONLY;

function forSale(kind: ShopKind, list: readonly { id: string; label: string }[]): Item[] {
  return list
    .flatMap((x) => {
      const price = shopPrice(kind, x.id);
      return price === null ? [] : [{ kind, id: x.id, label: x.label, price }];
    })
    .sort((a, b) => Number(isNew(b)) - Number(isNew(a)));
}

const SECTIONS: { title: string; hint: string; items: Item[] }[] = [
  {
    title: "Hintergründe",
    hint: "Färben dein Profil und die ganze App ein.",
    items: forSale("background", BACKGROUNDS),
  },
  {
    title: "Avatar-Rahmen",
    hint: "Animierte Rahmen um dein Profilbild.",
    items: forSale("decoration", AVATAR_DECORATIONS),
  },
  {
    title: "Namensschilder",
    hint: "Ein verzierter Streifen hinter deinem Namen, im Profil und im Feed.",
    items: forSale("plate", NAME_PLATES),
  },
  { title: "Namen", hint: "Dein Name mit Animation.", items: forSale("name", NAME_STYLES) },
  {
    title: "Profil-Effekte",
    hint: "Fliegen über deinen Profilkopf.",
    items: forSale("effect", PROFILE_EFFECTS),
  },
];

function inUse(profile: Profile, item: Item): boolean {
  if (item.kind === "background") return profile.backgroundId === item.id;
  if (item.kind === "decoration") return profile.decoration === item.id;
  if (item.kind === "effect") return profile.effect === item.id;
  if (item.kind === "plate") return profile.namePlate === item.id;
  return profile.nameStyle === item.id;
}

function Shop() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMyProfile() });
  const paws = usePaws();
  const [busy, setBusy] = useState<string | null>(null);
  const [collection, setCollection] = useState("alle");
  const inCollection = (kind: ShopKind, id: string) =>
    collection === "alle" || collectionOf(kind, id) === collection;
  const bundles = BUNDLES.filter(
    (b) => collection === "alle" || bundleCollection(b.id) === collection,
  );
  const profile = me.data;

  if (!profile) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-10">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const balance = paws.data?.paws ?? profile.paws ?? 0;
  const today = paws.data?.today ?? 0;
  const access = {
    activeDays: profile.activeDays ?? 0,
    team: profile.isAdmin,
    owned: profile.owned,
  };

  async function refresh() {
    await Promise.all(
      ["me", "profile", "feed", "paws"].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
  }

  async function buy(item: Item) {
    if (balance < item.price) {
      toast.error(`Dir fehlen noch ${item.price - balance} Pfoten.`);
      return;
    }
    if (!window.confirm(`„${item.label}“ für ${item.price} Pfoten kaufen?`)) return;
    setBusy(`${item.kind}:${item.id}`);
    try {
      const result = await buyShopItem({ data: { kind: item.kind, id: item.id } });
      queryClient.setQueryData(PAWS_KEY, (old: typeof paws.data) =>
        old ? { ...old, paws: result.paws } : old,
      );
      await equipShopItem({ data: { kind: item.kind, id: item.id } });
      await refresh();
      toast.success(`„${item.label}“ gehört jetzt dir und ist aktiv.`);
    } catch (err) {
      toast.error(memberErrorMessage(err, "Kauf fehlgeschlagen."));
    } finally {
      setBusy(null);
    }
  }

  async function buyBundle(id: string, label: string, price: number) {
    if (balance < price) {
      toast.error(`Dir fehlen noch ${price - balance} Pfoten.`);
      return;
    }
    if (!window.confirm(`„${label}“ für ${price} Pfoten kaufen?`)) return;
    setBusy(`bundle:${id}`);
    try {
      const result = await buyShopBundle({ data: { id } });
      queryClient.setQueryData(PAWS_KEY, (old: typeof paws.data) =>
        old ? { ...old, paws: result.paws } : old,
      );
      await refresh();
      toast.success(`„${label}“ gekauft (${result.count} Teile). Anlegen: unten auf „Benutzen“.`);
    } catch (err) {
      toast.error(memberErrorMessage(err, "Kauf fehlgeschlagen."));
    } finally {
      setBusy(null);
    }
  }

  async function equip(item: Item) {
    setBusy(`${item.kind}:${item.id}`);
    try {
      await equipShopItem({ data: { kind: item.kind, id: item.id } });
      await refresh();
      toast.success(`„${item.label}“ ist aktiv.`);
    } catch (err) {
      toast.error(memberErrorMessage(err, "Hat nicht geklappt."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 pb-24">
      <p className="text-xs tracking-[0.22em] text-fg-subtle uppercase">Profil schmücken</p>
      <h1 className="mt-1 font-display text-3xl">Shop</h1>

      <div className="mt-6 rounded-2xl border border-border bg-bg-elevated/70 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs text-fg-muted">Dein Guthaben</p>
            <p className="font-display text-4xl tabular-nums">
              🐾 {balance}
              <span className="ml-2 font-sans text-sm text-fg-muted">Pfoten</span>
            </p>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-fg-muted">
            <Clock className="size-3.5" />
            Heute {today} / {DAILY_PAW_CAP}
          </p>
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-bg-subtle"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={DAILY_PAW_CAP}
          aria-valuenow={today}
          aria-label="Heute verdiente Pfoten"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width]"
            style={{ width: `${Math.min(1, today / DAILY_PAW_CAP) * 100}%` }}
          />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
          Für jede Minute, die du hier bist, bekommst du 1 Pfote, bis zu {DAILY_PAW_CAP} am Tag.
          Belohnungen für aktive Tage schalten sich weiterhin von selbst frei, hier bekommst du sie
          früher.
        </p>
      </div>

      <nav
        aria-label="Kategorien"
        className="sticky top-0 z-20 -mx-5 mt-6 flex gap-2 overflow-x-auto bg-bg/85 px-5 py-3 backdrop-blur-md"
      >
        {[
          { id: "alle", label: "Alle" },
          ...COLLECTIONS.map((c) => ({ id: c.id, label: c.label })),
          { id: CLASSIC_COLLECTION, label: "Klassiker" },
        ].map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={collection === c.id}
            onClick={() => setCollection(c.id)}
            className={cn(
              "h-9 shrink-0 rounded-full border px-4 text-sm",
              collection === c.id
                ? "border-accent bg-accent text-accent-fg"
                : "border-border text-fg-muted hover:text-fg",
            )}
          >
            {c.label}
          </button>
        ))}
      </nav>

      {bundles.length ? (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 font-display text-xl">
            <Package className="size-5 text-accent" /> Pakete
          </h2>
          <p className="text-xs text-fg-subtle">
            Passende Teile zusammen, {Math.round(BUNDLE_DISCOUNT * 100)} % günstiger. Was du schon
            hast, zahlst du nicht noch mal.
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {bundles.map((bundle) => {
              const quote = bundleQuote(bundle.id, access)!;
              const complete = quote.missing.length === 0;
              const deco = bundle.items.find((it) => it.kind === "decoration");
              const plate = bundle.items.find((it) => it.kind === "plate");
              const effect = bundle.items.find((it) => it.kind === "effect");
              const bg = bundle.items.find((it) => it.kind === "background");
              return (
                <li
                  key={bundle.id}
                  className="flex flex-col overflow-hidden rounded-xl border border-border bg-bg-elevated/60"
                >
                  <div
                    className={cn(
                      "relative flex h-36 items-center gap-4 overflow-hidden px-5",
                      bg ? "bg-swatch" : "bg-bg-subtle",
                    )}
                    data-bg={bg?.id}
                  >
                    {effect ? (
                      <ProfileEffectLayer
                        effect={effect.id as NonNullable<Profile["effect"]>}
                        className="inset-0"
                      />
                    ) : null}
                    <DecoratedAvatar
                      src={profile.avatarUrl}
                      name={profile.displayName}
                      decoration={(deco?.id ?? null) as Profile["decoration"]}
                      className="relative z-10 size-16"
                      letterClassName="text-xl"
                    />
                    <span className="relative z-10 min-w-0 text-sm font-medium">
                      <NamePlate plate={(plate?.id ?? null) as Profile["namePlate"]}>
                        {profile.displayName}
                      </NamePlate>
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <p className="font-medium">{bundle.label}</p>
                    <p className="text-xs text-fg-subtle">
                      {bundle.items.map((it) => itemLabel(it.kind, it.id)).join(" · ")}
                    </p>
                    <div className="mt-auto pt-2">
                      {complete ? (
                        <span className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-accent/15 text-sm text-accent">
                          <Check className="size-4" /> Alles gehört dir
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void buyBundle(bundle.id, bundle.label, quote.price)}
                          className={cn(
                            "flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium tabular-nums",
                            balance >= quote.price
                              ? "bg-accent text-accent-fg"
                              : "border border-border text-fg-muted",
                          )}
                        >
                          {busy === `bundle:${bundle.id}` ? (
                            "…"
                          ) : (
                            <>
                              <ShoppingBag className="size-4" /> 🐾 {quote.price}
                              <span className="text-xs line-through opacity-60">{quote.full}</span>
                              <span className="rounded bg-heart/20 px-1 text-[11px] text-heart">
                                −{Math.round(BUNDLE_DISCOUNT * 100)} %
                              </span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter((it) => inCollection(it.kind, it.id)),
      }))
        .filter((section) => section.items.length > 0)
        .map((section) => (
          <section key={section.title} className="mt-10">
            <h2 className="font-display text-xl">{section.title}</h2>
            <p className="text-xs text-fg-subtle">{section.hint}</p>
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {section.items.map((item) => {
                const key = `${item.kind}:${item.id}`;
                const usable = canUseItem(item.kind, item.id, access);
                const active = inUse(profile, item);
                const day =
                  item.kind === "background" || item.kind === "plate" || isNew(item)
                    ? null
                    : unlockDay(item.kind, item.id);
                return (
                  <li
                    key={key}
                    className={cn(
                      "flex flex-col overflow-hidden rounded-xl border bg-bg-elevated/60",
                      active ? "border-accent" : "border-border",
                    )}
                  >
                    <Preview item={item} profile={profile} />
                    <div className="flex flex-1 flex-col gap-2 p-3">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        {item.label}
                        {isNew(item) ? (
                          <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">
                            Neu
                          </span>
                        ) : null}
                      </p>
                      {day !== null && !usable ? (
                        <p className="text-[11px] text-fg-subtle">Gratis ab Tag {day}</p>
                      ) : null}
                      <div className="mt-auto">
                        {active ? (
                          <span className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-accent/15 text-xs text-accent">
                            <Check className="size-3.5" /> Aktiv
                          </span>
                        ) : usable ? (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void equip(item)}
                            className="h-9 w-full rounded-lg border border-border text-xs hover:bg-bg-subtle"
                          >
                            {busy === key ? "…" : "Benutzen"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void buy(item)}
                            className={cn(
                              "flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-medium tabular-nums",
                              balance >= item.price
                                ? "bg-accent text-accent-fg"
                                : "border border-border text-fg-muted",
                            )}
                          >
                            {busy === key ? (
                              "…"
                            ) : (
                              <>
                                <ShoppingBag className="size-3.5" /> 🐾 {item.price}
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </div>
  );
}

function Preview({ item, profile }: { item: Item; profile: Profile }) {
  let content: ReactNode;
  if (item.kind === "background") {
    return <div className="bg-swatch h-24" data-bg={item.id} />;
  }
  if (item.kind === "decoration") {
    content = (
      <DecoratedAvatar
        src={profile.avatarUrl}
        name={profile.displayName}
        decoration={item.id as Profile["decoration"]}
        className="size-14"
        letterClassName="text-lg"
      />
    );
  } else if (item.kind === "plate") {
    content = (
      <span className="text-sm font-medium">
        <NamePlate plate={item.id as Profile["namePlate"]}>{profile.displayName}</NamePlate>
      </span>
    );
  } else if (item.kind === "name") {
    content = (
      <StyledName
        text={profile.displayName}
        nameStyle={item.id as Profile["nameStyle"]}
        className="font-display text-lg"
      />
    );
  } else {
    content = (
      <>
        <ProfileEffectLayer
          effect={item.id as NonNullable<Profile["effect"]>}
          className="inset-0"
        />
        <DecoratedAvatar
          src={profile.avatarUrl}
          name={profile.displayName}
          decoration={null}
          className="size-12"
          letterClassName="text-base"
        />
      </>
    );
  }
  return (
    <div className="relative grid h-24 place-items-center overflow-hidden bg-bg-subtle px-2">
      {content}
    </div>
  );
}
