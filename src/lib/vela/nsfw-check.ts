/**
 * In-browser FSK18 check (nsfwjs, MobileNetV2). Loaded lazily on the upload
 * page only. Only explicit content counts ("Porn" + "Hentai"); suggestive
 * pictures like a kiss ("Sexy") stay SFW.
 */
import type { NSFWJS } from "nsfwjs/core";

export const FSK18_THRESHOLD = 0.5;

let modelPromise: Promise<NSFWJS> | null = null;

export function loadNsfwModel(): Promise<NSFWJS> {
  modelPromise ??= (async () => {
    const [{ load }, { MobileNetV2Model }, tf] = await Promise.all([
      import("nsfwjs/core"),
      import("nsfwjs/models/mobilenet_v2"),
      import("@tensorflow/tfjs"),
    ]);
    tf.enableProdMode();
    return load("MobileNetV2", { modelDefinitions: [MobileNetV2Model] });
  })().catch((err: unknown) => {
    modelPromise = null;
    throw err;
  });
  return modelPromise;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Bild unlesbar."));
    img.src = src;
  });
}

/** Highest explicit score over the given images (data URLs), 0..1. */
export async function explicitScore(sources: string[]): Promise<number> {
  const model = await loadNsfwModel();
  let max = 0;
  for (const src of sources) {
    const predictions = await model.classify(await loadImage(src));
    const score = predictions
      .filter((p) => p.className === "Porn" || p.className === "Hentai")
      .reduce((sum, p) => sum + p.probability, 0);
    max = Math.max(max, score);
  }
  return max;
}
