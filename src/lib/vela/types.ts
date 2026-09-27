export const RELATIONSHIP_STATUSES = [
  { id: "single", label: "Single" },
  { id: "taken", label: "Vergeben" },
  { id: "open", label: "Offen" },
  { id: "complicated", label: "Es ist kompliziert" },
  { id: "private", label: "Lieber nicht sagen" },
] as const;

export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number]["id"];

export type Profile = {
  userId: string;
  displayName: string;
  handle: string;
  bio: string;
  age: number;
  relationshipStatus: RelationshipStatus;
  avatarUrl: string | null;
  /** Own banner image (URL), shown instead of the colour background. */
  bannerUrl: string | null;
  backgroundId: string;
  createdAt: string;
  postCount: number;
  followerCount: number;
  followingCount: number;
  isOwn: boolean;
  isFollowing: boolean;
  /** Only true on your own profile, if you may moderate the site. */
  isAdmin: boolean;
  /** Discord/FSK18 status — only filled in on your own profile. */
  fsk18: Fsk18Status | null;
};

export type Fsk18Status = {
  verified: boolean;
  /** Unlocked by hand by the team, not through a linked Discord account. */
  manual: boolean;
  discordUsername: string | null;
};

export type PostCard = {
  id: number;
  userId: string;
  imageUrl: string;
  caption: string;
  createdAt: string;
  /** Marked FSK18 by the uploader. */
  nsfw: boolean;
  /** FSK18 and the viewer is not verified: `imageUrl` is only a tiny blurred preview. */
  locked: boolean;
  likeCount: number;
  liked: boolean;
  commentCount: number;
  tags: PostTag[];
  author: {
    displayName: string;
    handle: string;
    avatarUrl: string | null;
    relationshipStatus: RelationshipStatus;
    age: number;
  };
};

export const POST_TAGS = [
  { id: "artwork", label: "Artwork" },
  { id: "fursuit", label: "Fursuit" },
  { id: "foto", label: "Foto" },
  { id: "sketch", label: "Sketch" },
  { id: "comic", label: "Comic" },
  { id: "3d", label: "3D" },
  { id: "pixel", label: "Pixel-Art" },
  { id: "meme", label: "Meme" },
] as const;

export type PostTag = (typeof POST_TAGS)[number]["id"];

export function tagLabel(id: string): string {
  return POST_TAGS.find((t) => t.id === id)?.label ?? id;
}

export type Comment = {
  id: number;
  body: string;
  createdAt: string;
  canDelete: boolean;
  author: { displayName: string; handle: string; avatarUrl: string | null };
};

export const REPORT_REASONS = [
  { id: "minor", label: "Person wirkt minderjährig" },
  { id: "unmarked_nsfw", label: "FSK 18, aber nicht markiert" },
  { id: "nonconsensual", label: "Ohne Einverständnis veröffentlicht" },
  { id: "illegal", label: "Illegaler Inhalt" },
  { id: "harassment", label: "Belästigung oder Hass" },
  { id: "spam", label: "Spam oder Betrug" },
  { id: "other", label: "Etwas anderes" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["id"];

export function relationshipLabel(id: string): string {
  return RELATIONSHIP_STATUSES.find((s) => s.id === id)?.label ?? "Single";
}
