/** Video upload rules shared by the upload page and the server. */
export const VIDEO_MAX_BYTES = 50_000_000;
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;

/** Only files in this app's Vercel Blob store are accepted as video URLs. */
export function isBlobVideoUrl(url: string): boolean {
  return /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/videos\//i.test(url);
}

/**
 * The Blob read/write token. Vercel names it BLOB_READ_WRITE_TOKEN unless the
 * store was connected with a custom prefix (e.g. VIDEOS_READ_WRITE_TOKEN), so
 * fall back to any variable holding a Vercel Blob token. Server-only.
 */
export function blobToken(): string | undefined {
  const direct = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (direct) return direct;
  for (const [key, value] of Object.entries(process.env)) {
    if (key.endsWith("READ_WRITE_TOKEN") && value?.trim().startsWith("vercel_blob_rw_")) {
      return value.trim();
    }
  }
  return undefined;
}
