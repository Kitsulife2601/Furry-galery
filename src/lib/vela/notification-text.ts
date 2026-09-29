import type { NotificationItem } from "./server";

/** The sentence after the actor's name ("gefällt dein Bild." …). */
export function notificationText(n: Pick<NotificationItem, "kind" | "body">): string {
  if (n.kind === "like") return "gefällt dein Bild.";
  if (n.kind === "follow") return "folgt dir jetzt.";
  if (n.kind === "comment") return `hat kommentiert: „${n.body}“`;
  if (n.kind === "reply") return `hat dir geantwortet: „${n.body}“`;
  if (n.kind === "comment_like") return "gefällt dein Kommentar.";
  return n.body;
}
