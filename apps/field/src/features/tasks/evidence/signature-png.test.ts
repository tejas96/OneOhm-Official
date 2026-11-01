import { describe, expect, it } from 'vitest';
import { crc32, encodePng, inkBox, rasterize, signaturePng } from './signature-png';

const readUint32 = (bytes: Uint8Array, at: number) =>
  ((bytes[at] ?? 0) * 0x1000000 +
    ((bytes[at + 1] ?? 0) << 16) +
    ((bytes[at + 2] ?? 0) << 8) +
    (bytes[at + 3] ?? 0)) >>>
  0;

/** Walks the chunks of a PNG: type, data and whether the CRC matches. */
function chunks(png: Uint8Array) {
  const found: { type: string; data: Uint8Array; crcOk: boolean }[] = [];
  let at = 8;
  while (at < png.length) {
    const length = readUint32(png, at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    const data = png.subarray(at + 8, at + 8 + length);
    const crcOk = crc32(png.subarray(at + 4, at + 8 + length)) === readUint32(png, at + 8 + length);
    found.push({ type, data, crcOk });
    at += 12 + length;
  }
  return found;
}

/** Undoes zlib stored blocks (what the encoder writes). */
function inflateStored(zlib: Uint8Array): Uint8Array {
  const out: number[] = [];
  let at = 2;
  for (;;) {
    const final = (zlib[at] ?? 0) & 1;
    const length = (zlib[at + 1] ?? 0) | ((zlib[at + 2] ?? 0) << 8);
    out.push(...zlib.subarray(at + 5, at + 5 + length));
    at += 5 + length;
    if (final) break;
  }
  return Uint8Array.from(out);
}

describe('encodePng', () => {
  it('writes a valid 1-bit greyscale PNG with correct checksums', () => {
    const ink = Uint8Array.from([1, 0, 0, 1]);
    const png = encodePng(2, 2, ink);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const parts = chunks(png);
    expect(parts.map((part) => part.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(parts.every((part) => part.crcOk)).toBe(true);
    const header = parts[0]?.data ?? new Uint8Array();
    expect(readUint32(header, 0)).toBe(2);
    expect(readUint32(header, 4)).toBe(2);
    expect([...header.subarray(8)]).toEqual([1, 0, 0, 0, 0]);
    // Row 1: filter 0, ink at x=0 → 0b0111_1111; row 2: ink at x=1 → 0b1011_1111.
    expect([...inflateStored(parts[1]?.data ?? new Uint8Array())]).toEqual([0, 0x7f, 0, 0xbf]);
  });

  it('splits large images over several stored blocks', () => {
    const png = encodePng(1200, 500, new Uint8Array(1200 * 500));
    const idat = chunks(png).find((part) => part.type === 'IDAT');
    expect(inflateStored(idat?.data ?? new Uint8Array())).toHaveLength((150 + 1) * 500);
  });
});

describe('rasterize', () => {
  it('inks the line between points and leaves the rest white', () => {
    const image = rasterize(
      [
        [
          { x: 1, y: 5 },
          { x: 9, y: 5 },
        ],
      ],
      { width: 10, height: 10 },
      1,
      1,
    );
    expect(image.ink[5 * 10 + 5]).toBe(1);
    expect(image.ink[0]).toBe(0);
  });

  it('crops to the ink with a margin, inside the pad', () => {
    expect(
      inkBox(
        [
          [
            { x: 50, y: 20 },
            { x: 80, y: 30 },
          ],
        ],
        { width: 300, height: 200 },
      ),
    ).toEqual({
      x: 38,
      y: 8,
      width: 54,
      height: 34,
    });
    expect(inkBox([[{ x: 2, y: 2 }]], { width: 300, height: 200 })).toMatchObject({ x: 0, y: 0 });
  });

  it('makes a PNG of the inked part at twice the scale', () => {
    const png = signaturePng(
      [
        [
          { x: 10, y: 10 },
          { x: 50, y: 30 },
        ],
      ],
      { width: 400, height: 200 },
    );
    const header = chunks(png)[0]?.data ?? new Uint8Array();
    // Ink spans 10..50 × 10..30, plus 12 each side, clamped at 0: 62 × 42, doubled.
    expect(readUint32(header, 0)).toBe(124);
    expect(readUint32(header, 4)).toBe(84);
  });
});
