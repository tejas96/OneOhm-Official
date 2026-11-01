import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  canThumbnail,
  isThumbnailKey,
  makeThumbnail,
  THUMBNAIL_EDGE,
  thumbnailKeyOf,
} from './thumbnail-image';

const photo = (width: number, height: number, orientation?: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 30, g: 120, b: 170 } } })
    .jpeg({ quality: 85 })
    .withMetadata(orientation ? { orientation } : {})
    .toBuffer();

describe('makeThumbnail', () => {
  it('turns a 12 MP photo into a 400 px WebP of a few KB', async () => {
    const original = await photo(4000, 3000);
    const preview = await makeThumbnail(original);
    const meta = await sharp(preview).metadata();
    expect(meta.format).toBe('webp');
    expect([meta.width, meta.height]).toEqual([THUMBNAIL_EDGE, 300]);
    expect(preview.length).toBeLessThan(original.length / 10);
  });

  it('turns a sideways phone photo upright by its EXIF orientation', async () => {
    // Stored 4000 × 3000 with "rotate 90°": the person sees a portrait photo.
    const preview = await makeThumbnail(await photo(4000, 3000, 6));
    const meta = await sharp(preview).metadata();
    expect([meta.width, meta.height]).toEqual([300, THUMBNAIL_EDGE]);
    expect(meta.orientation).toBeUndefined();
  });

  it('never enlarges a small image', async () => {
    const meta = await sharp(await makeThumbnail(await photo(240, 160))).metadata();
    expect([meta.width, meta.height]).toEqual([240, 160]);
  });

  it('refuses bytes that are not a photo', async () => {
    await expect(makeThumbnail(Buffer.from('%PDF-1.7 not a photo'))).rejects.toThrow();
  });
});

describe('thumbnail keys and types', () => {
  it('keeps the preview beside the original', () => {
    const key = thumbnailKeyOf('projects/p1/abc/roof.jpg');
    expect(key).toBe('projects/p1/abc/roof.jpg.thumb.webp');
    expect(isThumbnailKey(key)).toBe(true);
    expect(isThumbnailKey('projects/p1/abc/roof.jpg')).toBe(false);
  });

  it('makes previews of JPEG, PNG and WebP only', () => {
    expect(['image/jpeg', 'image/png', 'image/webp'].every(canThumbnail)).toBe(true);
    expect(['image/heic', 'application/pdf', 'video/mp4'].some(canThumbnail)).toBe(false);
  });
});
