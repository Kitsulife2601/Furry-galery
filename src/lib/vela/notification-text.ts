import type { NotificationItem } from "./server";

type TextInput = Pick<NotificationItem, "kind" | "body">;

/** The sentence after the actor's name ("gefällt dein Bild." …). */
export function notificationText(n: TextInput, opts: { video?: boolean } = {}): string {
  const what = opts.video ? "dein Video" : "dein Bild";
  if (n.kind === "like") return `gefällt ${what}.`;
  if (n.kind === "follow") return "folgt dir jetzt.";
  if (n.kind === "comment") return n.body ? `hat kommentiert: „${n.body}“` : "hat kommentiert.";
  if (n.kind === "reply") return n.body ? `hat dir geantwortet: „${n.body}“` : "hat dir geantwortet.";
  if (n.kind === "comment_like") return "gefällt dein Kommentar.";
  return n.body;
}

/**
 * Sentence for a grouped row with several people ("… und 3 anderen gefällt
 * dein Bild."). Likes take the dative ("anderen"), follows the nominative.
 */
export function groupedNotificationText(
  kind: NotificationItem["kind"],
  opts: { video?: boolean } = {},
): string {
  if (kind === "follow") return "folgen dir jetzt.";
  return notificationText({ kind, body: "" }, opts);
}

/** "3 anderen" / "3 andere" — the tail of "Mira und …". */
export function othersLabel(kind: NotificationItem["kind"], count: number): string {
  if (kind === "follow") return count === 1 ? "eine weitere Person" : `${count} andere`;
  return count === 1 ? "einer weiteren Person" : `${count} anderen`;
}

/** Short German label for the kind (filter chips, aria). */
export const NOTIFICATION_FILTERS = [
  { id: "all", label: "Alle", kinds: null },
  { id: "likes", label: "Likes", kinds: ["like", "comment_like"] },
  { id: "comments", label: "Kommentare", kinds: ["comment", "reply"] },
  { id: "follows", label: "Follower", kinds: ["follow"] },
  { id: "system", label: "System", kinds: ["system"] },
] as const satisfies readonly {
  id: string;
  label: string;
  kinds: readonly NotificationItem["kind"][] | null;
}[];

export type NotificationFilterId = (typeof NOTIFICATION_FILTERS)[number]["id"];
