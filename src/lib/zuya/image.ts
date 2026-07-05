// Turn any picked image into a web-safe, correctly-oriented, reasonably-sized
// JPEG. Fixes three iPhone problems at once: HEIC (which most browsers can't
// display), EXIF rotation (portrait photos showing sideways), and huge file
// sizes. Falls back to the original file if the browser can't decode it.
export async function toUploadableJpeg(
  file: File,
  max = 640,
  quality = 0.9,
): Promise<{ blob: Blob; type: string }> {
  try {
    // `imageOrientation: "from-image"` bakes the EXIF rotation into the bitmap.
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (blob) return { blob, type: "image/jpeg" };
  } catch {
    // Older browser / undecodable format — upload as-is.
  }
  return { blob: file, type: file.type || "image/jpeg" };
}
