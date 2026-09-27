/**
 * Grabs a still frame from a local video file: the poster shown in grids and
 * before playback, plus a 16px version for locked FSK18 posts.
 */
export async function videoPoster(file: File): Promise<{ poster: string; tiny: string }> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Video unlesbar."));
    });
    const at = Math.min(0.5, (video.duration || 0) / 2);
    if (at > 0) {
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        video.currentTime = at;
      });
    }
    const frame = (maxEdge: number, quality: number) => {
      const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", quality);
    };
    return { poster: frame(1080, 0.72), tiny: frame(16, 0.6) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
