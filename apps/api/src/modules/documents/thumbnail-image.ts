import sharp from 'sharp';

/**
 * Small previews for photos (PRD 9.3 "optimized image delivery"): galleries and tiles
 * load a 400 px WebP of a few dozen KB; the original opens only on view or download.
 */
export const THUMBNAIL_EDGE = 400;
export const THUMBNAIL_TYPE = 'image/webp';
const THUMBNAIL_SUFFIX = '.thumb.webp';

/** Photos the server can read. HEIC needs a decoder this build lacks; it shows as is. */
const READABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const canThumbnail = (contentType: string) => READABLE.has(contentType);

/** The preview sits beside the original: "<original key>.thumb.webp". */
export const thumbnailKeyOf = (storageKey: string) => `${storageKey}${THUMBNAIL_SUFFIX}`;

export const isThumbnailKey = (key: string) => key.endsWith(THUMBNAIL_SUFFIX);

/**
 * A WebP no larger than 400 px on its long edge, turned upright by its EXIF orientation
 * (the preview keeps no EXIF, so no location leaks through it). Small images are never
 * enlarged; transparency is kept.
 */
export function makeThumbnail(original: Buffer): Promise<Buffer> {
  return sharp(original, { failOn: 'error', limitInputPixels: 120_000_000 })
    .rotate()
    .resize({
      width: THUMBNAIL_EDGE,
      height: THUMBNAIL_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 72, effort: 4 })
    .toBuffer();
}
