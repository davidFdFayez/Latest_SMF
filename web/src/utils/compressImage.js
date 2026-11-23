import { MAX_FILE_BYTES } from '../data/registrationPortal';

/* ── image compression (REG-09) ──────────────────────────────────────────── */

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const blobToFile = (blob, name, type) =>
  new File([blob], name, { type, lastModified: Date.now() });

const toBlob = (canvas, type, quality) =>
  new Promise((done) => canvas.toBlob(done, type, quality));

/**
 * Shrinks a photo or scanned document until it fits the 1 MB cap, by first
 * bounding its longest edge and then stepping the JPEG/WebP quality down.
 * Returns the original file when it already fits, when it is not an image, or
 * when the browser cannot decode it — the size check then rejects it instead.
 */
export async function compressImage(file) {
  if (file.size <= MAX_FILE_BYTES) return file;
  if (!IMAGE_TYPES.includes(file.type)) return file;
  if (typeof createImageBitmap !== 'function') return file;

  // PNG and WebP may carry transparency, which JPEG would flatten to black.
  const outputType = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
  const extension = outputType === 'image/jpeg' ? '.jpg' : '.webp';
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'upload';

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    for (const maxEdge of [2000, 1600, 1200, 900]) {
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));

      const context = canvas.getContext('2d');
      if (!context) return file;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.82, 0.7, 0.6, 0.5]) {
        const blob = await toBlob(canvas, outputType, quality);
        if (blob && blob.size <= MAX_FILE_BYTES) {
          return blobToFile(blob, `${baseName}${extension}`, outputType);
        }
      }
    }
    return file;
  } finally {
    bitmap.close?.();
  }
}
