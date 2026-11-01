/**
 * Photos go up at a size that is sharp on a laptop screen and small on a weak signal
 * (PRD 9.3): the long edge at most 2000 px, saved as JPEG at quality 0.7. A typical
 * 12 MP phone photo drops from 3–5 MB to about 0.4–0.8 MB.
 */
export const PHOTO_MAX_EDGE = 2000;
export const PHOTO_QUALITY = 0.7;

export interface PhotoSize {
  readonly width: number;
  readonly height: number;
}

const known = (value: number) => Number.isFinite(value) && value > 0;

/**
 * The size a photo is sent at: its long edge brought down to `maxEdge` with the shape
 * kept. Null when it already fits (small photos are never enlarged) or its size is
 * unknown, so the photo goes up as it is.
 */
export function photoTargetSize(size: PhotoSize, maxEdge = PHOTO_MAX_EDGE): PhotoSize | null {
  const { width, height } = size;
  if (!known(width) || !known(height) || !known(maxEdge)) return null;
  const long = Math.max(width, height);
  if (long <= maxEdge) return null;
  const scale = maxEdge / long;
  return width >= height
    ? { width: maxEdge, height: Math.max(1, Math.round(height * scale)) }
    : { width: Math.max(1, Math.round(width * scale)), height: maxEdge };
}

/** "IMG_2041.HEIC" → "IMG_2041.jpg": the resized photo is always a JPEG. */
export function jpegName(name: string): string {
  const base = name.replace(/\.[a-z0-9]{1,5}$/i, '');
  return `${base || 'photo'}.jpg`;
}
