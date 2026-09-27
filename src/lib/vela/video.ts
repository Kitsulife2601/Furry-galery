/** Video upload rules shared by the upload page and the server. */
export const VIDEO_MAX_BYTES = 50_000_000;
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;

/** Only files in this app's Vercel Blob store are accepted as video URLs. */
export function isBlobVideoUrl(url: string): boolean {
  return /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/videos\//i.test(url);
}
