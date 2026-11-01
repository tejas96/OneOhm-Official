import { describe, expect, it } from 'vitest';
import { jpegName, PHOTO_MAX_EDGE, photoTargetSize } from './photo-size';

describe('photoTargetSize', () => {
  it('brings a landscape phone photo down to a 2000 px long edge', () => {
    expect(photoTargetSize({ width: 4032, height: 3024 })).toEqual({ width: 2000, height: 1500 });
  });

  it('keeps the shape of a portrait photo', () => {
    expect(photoTargetSize({ width: 3000, height: 4000 })).toEqual({ width: 1500, height: 2000 });
  });

  it('rounds the short edge to whole pixels', () => {
    expect(photoTargetSize({ width: 4000, height: 2251 })).toEqual({ width: 2000, height: 1126 });
  });

  it('never enlarges a photo that already fits', () => {
    expect(photoTargetSize({ width: 1600, height: 1200 })).toBeNull();
    expect(photoTargetSize({ width: PHOTO_MAX_EDGE, height: 900 })).toBeNull();
  });

  it('leaves a photo alone when its size is unknown', () => {
    expect(photoTargetSize({ width: 0, height: 3000 })).toBeNull();
    expect(photoTargetSize({ width: Number.NaN, height: 3000 })).toBeNull();
  });

  it('handles a very long panorama without a zero edge', () => {
    expect(photoTargetSize({ width: 20000, height: 5 })).toEqual({ width: 2000, height: 1 });
  });

  it('takes another edge limit', () => {
    expect(photoTargetSize({ width: 1200, height: 800 }, 400)).toEqual({ width: 400, height: 267 });
  });
});

describe('jpegName', () => {
  it('names the resized photo as a JPEG', () => {
    expect(jpegName('IMG_2041.HEIC')).toBe('IMG_2041.jpg');
    expect(jpegName('roof east.png')).toBe('roof east.jpg');
    expect(jpegName('site-photo-1.jpg')).toBe('site-photo-1.jpg');
    expect(jpegName('')).toBe('photo.jpg');
  });
});
