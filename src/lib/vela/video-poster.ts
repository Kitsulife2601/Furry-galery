/**
 * Grabs a still frame from a local video file: the poster shown in grids and
 * before playback, plus a 16px version for locked FSK18 posts.
 */

/** Waits for a media event, but never forever (some codecs fire nothing at all). */
function once(video: HTMLVideoElement, event: "loadeddata" | "seeked", ms: number) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Video unlesbar. Probier MP4 (H.264)."));
    }, ms);
    const ok = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error("Dieses Video kann dein Browser nicht abspielen. Probier MP4 (H.264)."));
    };
    function cleanup() {
      window.clearTimeout(timer);
      video.removeEventListener(event, ok);
      video.removeEventListener("error", fail);
    }
    video.addEventListener(event, ok);
    video.addEventListener("error", fail);
  });
}

async function seek(video: HTMLVideoElement, time: number) {
  const done = once(video, "seeked", 8000);
  video.currentTime = time;
  await done;
}

export async function videoPoster(file: File): Promise<{
  poster: string;
  tiny: string;
  samples: string[];
  /** Length in seconds (0 if unknown). */
  duration: number;
}> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  try {
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const loaded = once(video, "loadeddata", 15000);
    video.src = url;
    await loaded;
    if (!video.videoWidth || !video.videoHeight) {
      throw new Error("Im Video ist kein Bild zu sehen. Probier MP4 (H.264).");
    }
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const at = Math.min(0.5, duration / 2);
    if (at > 0) await seek(video, at);
    const frame = (maxEdge: number, quality: number) => {
      const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", quality);
    };
    const poster = frame(1080, 0.72);
    const tiny = frame(16, 0.6);
    // A few more frames for the FSK18 check.
    const samples = [frame(320, 0.8)];
    if (duration > 1) {
      for (const t of [0.25, 0.5, 0.75]) {
        await seek(video, duration * t);
        samples.push(frame(320, 0.8));
      }
    }
    return { poster, tiny, samples, duration };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
