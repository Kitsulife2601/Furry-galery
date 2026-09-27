import { formatMb } from "./media-limits";

const MAX_DATA_URL_CHARS = 700_000;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Bild konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

/**
 * Shrink a photo to `maxEdge` and re-encode it as JPEG. With `keepGifUpTo`
 * set, a GIF is kept as it is (so it stays animated) if it fits that size.
 */
export async function compressImageFile(
  file: File,
  opts: { maxEdge?: number; quality?: number; keepGifUpTo?: number } = {},
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Bitte ein Bild wählen.");
  }
  if (file.type === "image/gif" && opts.keepGifUpTo) {
    if (file.size > opts.keepGifUpTo) {
      throw new Error(`Das GIF ist zu groß (höchstens ${formatMb(opts.keepGifUpTo)}).`);
    }
    return readAsDataUrl(file);
  }
  const maxEdge = opts.maxEdge ?? 1080;
  const quality = opts.quality ?? 0.72;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Bild konnte nicht gelesen werden.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  let q = quality;
  let dataUrl = canvas.toDataURL("image/jpeg", q);
  while (dataUrl.length > MAX_DATA_URL_CHARS && q > 0.4) {
    q -= 0.08;
    dataUrl = canvas.toDataURL("image/jpeg", q);
  }
  if (dataUrl.length > MAX_DATA_URL_CHARS) {
    throw new Error("Das Bild ist zu groß. Bitte ein kleineres wählen.");
  }
  return dataUrl;
}
