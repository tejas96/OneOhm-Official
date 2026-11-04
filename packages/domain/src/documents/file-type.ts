import {
  AUDIO_FILE_TYPES,
  detectMediaType,
  type MediaFileType,
  maxBytesFor,
  VIDEO_FILE_TYPES,
} from './media-type';

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Word and Excel files: kept when a customer sends them on WhatsApp, never accepted elsewhere. */
export const OFFICE_FILE_TYPES = [DOCX_TYPE, XLSX_TYPE] as const;
export type OfficeFileType = (typeof OFFICE_FILE_TYPES)[number];

/**
 * Every paper and photo OneOhm accepts. The type comes from the file's bytes, never its
 * name. Voice notes and videos are accepted only as field evidence (`EVIDENCE_FILE_TYPES`).
 */
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

/** Any type OneOhm can recognise: papers and photos, voice notes and videos. */
export type DetectedFileType = AcceptedFileType | MediaFileType | OfficeFileType;

/** A task's or service visit's evidence: photos and papers, voice notes and short videos. */
export const EVIDENCE_FILE_TYPES: readonly DetectedFileType[] = [
  ...ACCEPTED_FILE_TYPES,
  ...AUDIO_FILE_TYPES,
  ...VIDEO_FILE_TYPES,
];

/** What a customer's WhatsApp file may be: evidence, plus Word and Excel files (kept, never filed as a paper). */
export const WHATSAPP_FILE_TYPES: readonly DetectedFileType[] = [
  ...EVIDENCE_FILE_TYPES,
  ...OFFICE_FILE_TYPES,
];

/** The size cap of one file of this type (papers and photos 25 MB). */
export const uploadLimitOf = (contentType: string): number =>
  maxBytesFor(contentType, MAX_UPLOAD_BYTES);

/** The largest file any of these types may be: the cap the upload route reads up to. */
export const uploadLimitFor = (types: readonly string[]): number =>
  Math.max(MAX_UPLOAD_BYTES, ...types.map(uploadLimitOf));

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

/** How many entries are read before deciding: Word and Excel put their folder first. */
const ZIP_ENTRIES_READ = 8;

const u16 = (bytes: Uint8Array, at: number) => (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8);
const u32 = (bytes: Uint8Array, at: number) => u16(bytes, at) + u16(bytes, at + 2) * 0x10000;

/**
 * Word and Excel files are ZIPs: `PK\x03\x04`, then entries whose names start `word/` or
 * `xl/`. The entries' local headers are walked in order (30 bytes, name, extra, data), so a
 * name inside another file's stored data is never read. An entry whose size is only given
 * after its data cannot be skipped, so the walk stops there.
 */
function detectOffice(bytes: Uint8Array): DetectedFileType | null {
  let at = 0;
  for (let entry = 0; entry < ZIP_ENTRIES_READ; entry += 1) {
    if (at + 30 > bytes.length || ascii(bytes, at, 4) !== 'PK\x03\x04') return null;
    const nameLength = u16(bytes, at + 26);
    const name = ascii(bytes, at + 30, Math.min(nameLength, 64));
    if (name.startsWith('word/')) return DOCX_TYPE;
    if (name.startsWith('xl/')) return XLSX_TYPE;
    const sized = (u16(bytes, at + 6) & 0x08) === 0 || u32(bytes, at + 18) > 0;
    if (!sized) return null;
    at += 30 + nameLength + u16(bytes, at + 28) + u32(bytes, at + 18);
  }
  return null;
}

/**
 * Detects JPEG, PNG, WebP, HEIC/HEIF, PDF, Word and Excel files, and the accepted audio and video formats,
 * from their signatures; anything else is null.
 */
export function detectFileType(bytes: Uint8Array): DetectedFileType | null {
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
  return detectOffice(bytes) ?? detectMediaType(bytes);
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
