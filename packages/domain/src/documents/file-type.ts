/** Every file OneOhm accepts. The type comes from the file's bytes, never its name. */
export const ACCEPTED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
] as const;
export type AcceptedFileType = (typeof ACCEPTED_FILE_TYPES)[number];

/** Photos only: what a phone camera produces. */
export const PHOTO_FILE_TYPES: readonly AcceptedFileType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
];

/** Logos, signatures and stamps are embedded in PDFs, which cannot show HEIC. */
export const COMPANY_ASSET_FILE_TYPES: readonly AcceptedFileType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

/** Detects JPEG, PNG, WebP, HEIC/HEIF and PDF from their signatures; anything else is null. */
export function detectFileType(bytes: Uint8Array): AcceptedFileType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === 'PNG' &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a
  ) {
    return 'image/png';
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return 'image/webp';
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp' && HEIC_BRANDS.has(ascii(bytes, 8, 4))) {
    return 'image/heic';
  }
  if (bytes.length >= 5 && ascii(bytes, 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

export const isImageType = (contentType: string): boolean => contentType.startsWith('image/');

/** A file name safe for storage keys and download headers: letters, digits, dot, dash. */
export function safeFileName(name: string, fallback = 'file'): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120);
  return cleaned || fallback;
}
