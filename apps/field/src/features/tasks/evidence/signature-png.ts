/** A point on the signature pad, in the pad's own layout units. */
export interface Point {
  readonly x: number;
  readonly y: number;
}
export type Stroke = readonly Point[];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

const writeUint32 = (target: Uint8Array, offset: number, value: number) => {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
};

/** zlib with stored (uncompressed) blocks: tiny to write, and a 1-bit image is small. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const blockCount = Math.max(1, Math.ceil(raw.length / 65535));
  const out = new Uint8Array(2 + raw.length + blockCount * 5 + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let at = 2;
  for (let block = 0; block < blockCount; block += 1) {
    const start = block * 65535;
    const length = Math.min(65535, raw.length - start);
    out[at] = block === blockCount - 1 ? 1 : 0;
    out[at + 1] = length & 0xff;
    out[at + 2] = length >>> 8;
    out[at + 3] = ~length & 0xff;
    out[at + 4] = (~length >>> 8) & 0xff;
    out.set(raw.subarray(start, start + length), at + 5);
    at += 5 + length;
  }
  writeUint32(out, at, adler32(raw));
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  writeUint32(out, 0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  writeUint32(out, 8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A black-on-white 1-bit greyscale PNG from an ink mask (1 = ink), row by row. */
export function encodePng(width: number, height: number, ink: Uint8Array): Uint8Array {
  const rowBytes = Math.ceil(width / 8);
  const raw = new Uint8Array((rowBytes + 1) * height).fill(0xff);
  for (let y = 0; y < height; y += 1) {
    const row = y * (rowBytes + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const at = row + 1 + (x >> 3);
      if (ink[y * width + x]) raw[at] = (raw[at] ?? 0xff) & ~(0x80 >> (x & 7));
    }
    // Padding bits past the last pixel stay white.
  }
  const header = new Uint8Array(13);
  writeUint32(header, 0, width);
  writeUint32(header, 4, height);
  header.set([1, 0, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlibStored(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    png.set(part, at);
    at += part.length;
  }
  return png;
}

/** Draws the strokes as round-ended lines `radius` wide, `scale` pixels per layout unit. */
export function rasterize(
  strokes: readonly Stroke[],
  size: { readonly width: number; readonly height: number },
  scale: number,
  radius: number,
): { readonly width: number; readonly height: number; readonly ink: Uint8Array } {
  const width = Math.max(1, Math.round(size.width * scale));
  const height = Math.max(1, Math.round(size.height * scale));
  const ink = new Uint8Array(width * height);
  const r = Math.max(1, radius * scale);
  const disc: [number, number][] = [];
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy += 1) {
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx += 1) {
      if (dx * dx + dy * dy <= r * r) disc.push([dx, dy]);
    }
  }
  const stamp = (cx: number, cy: number) => {
    for (const [dx, dy] of disc) {
      const x = Math.round(cx) + dx;
      const y = Math.round(cy) + dy;
      if (x >= 0 && y >= 0 && x < width && y < height) ink[y * width + x] = 1;
    }
  };
  for (const stroke of strokes) {
    stroke.forEach((point, index) => {
      const previous = stroke[index - 1] ?? point;
      const steps = Math.max(
        1,
        Math.ceil((Math.hypot(point.x - previous.x, point.y - previous.y) * scale) / (r / 2)),
      );
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        stamp(
          (previous.x + (point.x - previous.x) * t) * scale,
          (previous.y + (point.y - previous.y) * t) * scale,
        );
      }
    });
  }
  return { width, height, ink };
}

/** Room kept around the ink when the signature is cropped, in layout units. */
const MARGIN = 12;

/** The part of the pad the ink covers, with a margin, so the file holds no empty paper. */
export function inkBox(
  strokes: readonly Stroke[],
  size: { readonly width: number; readonly height: number },
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  const points = strokes.flat();
  if (points.length === 0) return { x: 0, y: 0, ...size };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.max(0, Math.min(...xs) - MARGIN);
  const top = Math.max(0, Math.min(...ys) - MARGIN);
  const right = Math.min(size.width, Math.max(...xs) + MARGIN);
  const bottom = Math.min(size.height, Math.max(...ys) + MARGIN);
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

/** The signature as a PNG at twice the pad's scale, cropped to the ink. */
export function signaturePng(
  strokes: readonly Stroke[],
  size: { readonly width: number; readonly height: number },
): Uint8Array {
  const box = inkBox(strokes, size);
  const moved = strokes.map((stroke) =>
    stroke.map((point) => ({ x: point.x - box.x, y: point.y - box.y })),
  );
  const image = rasterize(moved, box, 2, 1.4);
  return encodePng(image.width, image.height, image.ink);
}
