/** Upload size caps (file bytes). GIFs are stored as they are, so they get room. */
export const MEDIA_LIMITS = {
  avatar: 1_000_000,
  banner: 2_000_000,
  post: 3_000_000,
} as const;

export type MediaKind = keyof typeof MEDIA_LIMITS;

/** Length of a base64 data URL for a file of `bytes` bytes (plus the header). */
export function dataUrlChars(bytes: number): number {
  return Math.ceil(bytes / 3) * 4 + 64;
}

const IMAGE_DATA_URL = /^data:image\/(jpeg|png|gif|webp);base64,/;

export function isImageDataUrl(value: string): boolean {
  return IMAGE_DATA_URL.test(value);
}

export function formatMb(bytes: number): string {
  return `${(bytes / 1_000_000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
}
