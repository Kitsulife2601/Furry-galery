/**
 * Server-side FSK18 check for new posts — the same model and threshold as the
 * upload page, so the check can't be skipped by bypassing the browser. Posts
 * store JPEG (or the original GIF) data URLs; for videos the poster frame is
 * checked. Everything is imported lazily so only createPost pays for it.
 */
import type { NSFWJS } from "nsfwjs/core";
import { FSK18_THRESHOLD } from "./nsfw-check";

type Rgba = { width: number; height: number; data: Uint8Array | Uint8ClampedArray };

let modelPromise: Promise<NSFWJS> | null = null;

function loadModel(): Promise<NSFWJS> {
  modelPromise ??= (async () => {
    const [{ load }, { MobileNetV2Model }, tf] = await Promise.all([
      import("nsfwjs/core"),
      import("nsfwjs/models/mobilenet_v2"),
      import("@tensorflow/tfjs"),
    ]);
    tf.enableProdMode();
    await tf.setBackend("cpu");
    return load("MobileNetV2", { modelDefinitions: [MobileNetV2Model] });
  })().catch((err: unknown) => {
    modelPromise = null;
    throw err;
  });
  return modelPromise;
}

/** Decodes a data URL into RGBA frames (a GIF gives its first and middle frame). */
export async function decodeImageDataUrl(dataUrl: string): Promise<Rgba[] | null> {
  const match = /^data:image\/(jpeg|jpg|png|gif);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  const kind = match[1]!.toLowerCase();
  const bytes = Buffer.from(match[2]!, "base64");
  if (kind === "jpeg" || kind === "jpg") {
    const { decode } = await import("jpeg-js");
    const img = decode(bytes, { useTArray: true, maxMemoryUsageInMB: 256 });
    return [{ width: img.width, height: img.height, data: img.data }];
  }
  if (kind === "png") {
    const { PNG } = await import("pngjs");
    const img = PNG.sync.read(bytes);
    return [{ width: img.width, height: img.height, data: img.data }];
  }
  const { GifReader } = await import("omggif");
  const reader = new GifReader(bytes);
  const frames = [...new Set([0, Math.floor(reader.numFrames() / 2)])];
  return frames.map((i) => {
    const data = new Uint8Array(reader.width * reader.height * 4);
    reader.decodeAndBlitFrameRGBA(i, data);
    return { width: reader.width, height: reader.height, data };
  });
}

/** Highest "Porn" + "Hentai" score over the frames, 0..1. */
export async function explicitScoreServer(frames: Rgba[]): Promise<number> {
  const [model, tf] = await Promise.all([loadModel(), import("@tensorflow/tfjs")]);
  let max = 0;
  for (const frame of frames) {
    const rgb = new Int32Array(frame.width * frame.height * 3);
    for (let i = 0, j = 0; i < frame.data.length; i += 4, j += 3) {
      rgb[j] = frame.data[i]!;
      rgb[j + 1] = frame.data[i + 1]!;
      rgb[j + 2] = frame.data[i + 2]!;
    }
    const tensor = tf.tensor3d(rgb, [frame.height, frame.width, 3], "int32");
    try {
      const predictions = await model.classify(tensor);
      const score = predictions
        .filter((p) => p.className === "Porn" || p.className === "Hentai")
        .reduce((sum, p) => sum + p.probability, 0);
      max = Math.max(max, score);
    } finally {
      tensor.dispose();
    }
  }
  return max;
}

/**
 * Throws when a post not marked FSK 18 looks explicit (checks the image, or a
 * video's poster plus sample frames). An image that can't be decoded is
 * refused too (the site itself only sends JPEG/GIF); a failure of the model
 * itself is logged and lets the post through.
 */
export async function assertFsk18Marked(imageDataUrls: string[]): Promise<void> {
  const frames: Rgba[] = [];
  for (const url of imageDataUrls) {
    const decoded = await decodeImageDataUrl(url).catch(() => null);
    if (!decoded) {
      throw new Error("Bild konnte nicht geprüft werden. Bitte als JPG oder GIF hochladen.");
    }
    frames.push(...decoded);
  }
  let score: number;
  try {
    score = await explicitScoreServer(frames);
  } catch (err) {
    console.error("[fsk18-check] model failed", err);
    return;
  }
  if (score >= FSK18_THRESHOLD) {
    throw new Error("Das wirkt wie FSK 18 – bitte den Haken bei FSK 18 setzen.");
  }
}
