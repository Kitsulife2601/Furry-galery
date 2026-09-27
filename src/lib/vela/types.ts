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

export function relationshipLabel(id: string): string {
  return RELATIONSHIP_STATUSES.find((s) => s.id === id)?.label ?? "Single";
}
