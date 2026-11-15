import sharp from 'sharp';

/** A centre crop as JPEG at exactly `width` × `height` (cover fit, upright). */
export function centreCrop(bytes: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(bytes, { failOn: 'error', limitInputPixels: 120_000_000 })
    .rotate()
    .resize({ width, height, fit: 'cover', position: 'centre' })
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** The Google crops: 1.91:1 at 1200×628 and 1:1 at 1200×1200. */
export const googleCrops = (bytes: () => Promise<Buffer>) => ({
  landscape: async () => centreCrop(await bytes(), 1200, 628),
  square: async () => centreCrop(await bytes(), 1200, 1200),
});

/** The logo as a 512×512 JPEG on white (Google wants a square logo). */
export function squareLogo(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes, { failOn: 'error', limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width: 512, height: 512, fit: 'contain', background: '#ffffff' })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 90 })
    .toBuffer();
}
