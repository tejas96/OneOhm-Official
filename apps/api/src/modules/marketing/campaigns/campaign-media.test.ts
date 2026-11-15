import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { photoTooSmall, prepareImage } from './campaign-media';
import { centreCrop } from './media-crops';

const png = (width: number, height: number) =>
  sharp({
    create: { width, height, channels: 4, background: { r: 200, g: 100, b: 0, alpha: 0.5 } },
  })
    .png()
    .toBuffer();

describe('campaign photos', () => {
  it('turns a PNG into a JPEG and reads its size', async () => {
    const photo = await prepareImage(await png(800, 700));
    expect(photo).toMatchObject({ width: 800, height: 700 });
    expect(photo.buffer.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  });

  it('refuses a photo under 600 pixels on its short side', () => {
    expect(photoTooSmall(599, 2000)).toBe(true);
    expect(photoTooSmall(600, 600)).toBe(false);
  });

  it('refuses bytes that are not a picture, in plain words', async () => {
    await expect(prepareImage(Buffer.from('not a photo'))).rejects.toThrow(
      'This photo could not be read. Save it as a JPEG and try again.',
    );
  });

  it('crops to the exact Google shapes', async () => {
    const source = await prepareImage(await png(1000, 800));
    const landscape = await sharp(await centreCrop(source.buffer, 1200, 628)).metadata();
    const square = await sharp(await centreCrop(source.buffer, 1200, 1200)).metadata();
    expect([landscape.width, landscape.height]).toEqual([1200, 628]);
    expect([square.width, square.height]).toEqual([1200, 1200]);
  });
});
