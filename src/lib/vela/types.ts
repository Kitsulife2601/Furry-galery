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
  backgroundId: string;
  createdAt: string;
  postCount: number;
  followerCount: number;
  followingCount: number;
  isOwn: boolean;
  isFollowing: boolean;
};

export type PostCard = {
  id: number;
  userId: string;
  imageUrl: string;
  caption: string;
  createdAt: string;
  likeCount: number;
  liked: boolean;
  author: {
    displayName: string;
    handle: string;
    avatarUrl: string | null;
    relationshipStatus: RelationshipStatus;
    age: number;
  };
};

export const REPORT_REASONS = [
  { id: "minor", label: "Person wirkt minderjährig" },
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
