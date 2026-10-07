import { formatMb } from "./media-limits";

const MAX_DATA_URL_CHARS = 700_000;

/** Simple edits applied while compressing: quarter turns and a centred crop. */
export type ImageEdits = {
  /** Clockwise quarter turns. */
  rotate?: 0 | 90 | 180 | 270;
  /** Crop to this width/height ratio (centred), e.g. 3 / 4. */
  aspect?: number | null;
};

export function hasEdits(edits: ImageEdits | undefined): boolean {
  return Boolean(edits && ((edits.rotate ?? 0) !== 0 || edits.aspect));
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Bild konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error(
      /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)
        ? "HEIC-Fotos kann dein Browser nicht lesen. Bitte als JPG oder PNG speichern."
        : "Dieses Bild kann dein Browser nicht lesen. Probier JPG, PNG, GIF oder WebP.",
    );
  }
}

/**
 * Shrink a photo to `maxEdge` and re-encode it as JPEG, optionally turned and
 * cropped. With `keepGifUpTo` set, an unedited GIF is kept as it is (so it
 * stays animated) if it fits that size.
 */
export async function compressImageFile(
  file: File,
  opts: { maxEdge?: number; quality?: number; keepGifUpTo?: number; edits?: ImageEdits } = {},
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Bitte ein Bild wählen.");
  }
  if (file.type === "image/gif" && opts.keepGifUpTo && !hasEdits(opts.edits)) {
    if (file.size > opts.keepGifUpTo) {
      throw new Error(`Das GIF ist zu groß (höchstens ${formatMb(opts.keepGifUpTo)}).`);
    }
    return readAsDataUrl(file);
  }
  const maxEdge = opts.maxEdge ?? 1080;
  const quality = opts.quality ?? 0.72;
  const rotate = opts.edits?.rotate ?? 0;
  const bitmap = await decode(file);
  const turned = rotate === 90 || rotate === 270;
  // Size of the image after turning it.
  const rw = turned ? bitmap.height : bitmap.width;
  const rh = turned ? bitmap.width : bitmap.height;
  // Centred crop inside the turned image.
  let cw = rw;
  let ch = rh;
  const aspect = opts.edits?.aspect;
  if (aspect && aspect > 0) {
    if (rw / rh > aspect) cw = rh * aspect;
    else ch = rw / aspect;
  }
  const cx = (rw - cw) / 2;
  const cy = (rh - ch) / 2;
  const scale = Math.min(1, maxEdge / Math.max(cw, ch));
  const width = Math.max(1, Math.round(cw * scale));
  const height = Math.max(1, Math.round(ch * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Bild konnte nicht gelesen werden.");
  // JPEG has no transparency: put PNG/WebP cut-outs on the site background, not black.
  ctx.fillStyle = "#0c0b0a";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
  ctx.translate(rw / 2, rh / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
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
